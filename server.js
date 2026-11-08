import http from 'node:http';
import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { MODEL_VERSION, WEIGHTS, PARAMETERS, scoreBuilding, scorePortfolio, ValidationError } from './src/risk.js';
import { parseCSV, parseJSON } from './src/import.js';
import {describeFragment,MERGE_FIELDS,mergeFragments} from './src/merge.js';
import {exportMerge} from './src/merge-export.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MAX_BYTES = 10 * 1024 * 1024;
const fragments=new Map();
const FRAGMENT_TTL=30*60*1000,MAX_FRAGMENT_MEMORY=80*1024*1024;
function expireFragments(){for(const [id,file]of fragments)if(Date.now()-file.accessed>FRAGMENT_TTL)fragments.delete(id);}
function fragmentSelection(spec){
  expireFragments();
  if(!Array.isArray(spec.files)||!spec.files.length||spec.files.length>10)throw new ValidationError(['Select 1–10 source files to merge.']);
  if(spec.files.some(file=>!file||typeof file!=='object'||typeof file.id!=='string'||file.mapping!==undefined&&(!file.mapping||typeof file.mapping!=='object'||Array.isArray(file.mapping))))throw new ValidationError(['Every selected source must have an upload ID and a valid column mapping.']);
  if(new Set(spec.files.map(f=>f?.id)).size!==spec.files.length)throw new ValidationError(['The same uploaded file cannot be selected twice.']);
  return spec.files.map(selection=>{const file=fragments.get(selection.id);if(!file)throw new ValidationError(['An uploaded source has expired or the server restarted. Upload the files again.']);file.accessed=Date.now();return {...file,kind:selection.kind||describeFragment(file).kind,mapping:selection.mapping||describeFragment(file).mapping};});
}
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.sqlite': 'application/vnd.sqlite3', '.db': 'application/vnd.sqlite3', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(path.join(PUBLIC, 'data', file), 'utf8')); }
  catch (error) { if (fallback !== undefined && error.code === 'ENOENT') return fallback; throw error; }
}
async function context() {
  const [benchmarks, sources] = await Promise.all([readJSON('benchmarks.json', {}), readJSON('sources.json', [])]);
  return { benchmarks, sources };
}
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload, (_, v) => typeof v === 'bigint' ? Number(v) : v));
}
async function body(req) {
  let length = 0; const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BYTES) { const e = new ValidationError(['File exceeds the 10 MiB upload limit.']); e.status = 413; throw e; }
    chunks.push(chunk);
  }
  if (!length) throw new ValidationError(['The uploaded file or request body is empty.']);
  return Buffer.concat(chunks);
}
function sqliteRows(file,fragment=false) {
  const db = new DatabaseSync(file, { readOnly: true, enableLoadExtension: false });
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='buildings'").get();
    if (!table&&fragment){
      const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t=>t.name);
      const name=tables.includes('weather')?'weather':tables.length===1?tables[0]:null;
      if(name)return db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" LIMIT 5001`).all();
    }
    if (!table) throw new ValidationError(['SQLite must contain a buildings table, a weather table, or one unambiguous data table.']);
    const columns = new Set(db.prepare('PRAGMA table_info(buildings)').all().map(c => c.name));
    const normalizedWeather = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='weather'").get();
    // Our normalized database stores station/year weather once, rather than duplicating it in each building.
    const rows = !columns.has('hot_days') && columns.has('weather_key') && normalizedWeather
      ? db.prepare('SELECT b.*, w.hot_days, w.freeze_days, w.weather_region FROM buildings b LEFT JOIN weather w ON b.weather_key = w.weather_key AND b.report_year = w.report_year LIMIT 5001').all()
      : db.prepare('SELECT * FROM buildings LIMIT 5001').all();
    return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
  } finally { db.close(); }
}
async function importRows(buffer, filename,fragment=false) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.csv') return parseCSV(buffer.toString('utf8'));
  if (ext === '.json') {
    if(fragment){let data;try{data=JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/,''));}catch{throw new ValidationError(['The JSON file is not valid JSON.']);}const rows=Array.isArray(data)?data:data?.buildings||data?.rows||data?.records||data?.weather;if(!Array.isArray(rows))throw new ValidationError(['JSON must contain an array, or a buildings, rows, records or weather array.']);return rows;}
    return parseJSON(buffer.toString('utf8'));
  }
  if (['.sqlite', '.sqlite3', '.db'].includes(ext)) {
    if (buffer.subarray(0, 16).toString('binary') !== 'SQLite format 3\u0000') throw new ValidationError(['File is not a SQLite 3 database.']);
    const folder = path.join(ROOT, 'work', 'uploads'); await mkdir(folder, { recursive: true });
    const file = path.join(folder, `${randomUUID()}.sqlite`);
    await writeFile(file, buffer);
    try { return sqliteRows(file,fragment); }
    catch (error) { if (error instanceof ValidationError) throw error; throw new ValidationError([`Could not read the SQLite buildings table: ${error.message}`]); }
    finally { await unlink(file).catch(() => {}); }
  }
  throw new ValidationError(['Choose a .csv, .json, .sqlite, .sqlite3 or .db file.']);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith('/api/')) {
      // This local prototype accepts same-origin requests; no cross-origin upload or score API.
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Cross-origin requests are not supported.' });
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', modelVersion: MODEL_VERSION });
      const ctx = await context();
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { weights: WEIGHTS, benchmarks: { ...ctx.benchmarks, byBuildingType: ctx.benchmarks.building_types || {}, byPropertyType: ctx.benchmarks.property_types || {} }, parameters: PARAMETERS, modelVersion: MODEL_VERSION });
      if (req.method === 'GET' && url.pathname === '/api/sources') return json(res, 200, ctx.sources);
      if (req.method === 'GET' && url.pathname === '/api/portfolio') {
        const data = await readJSON('buildings.json');
        const buildings = Array.isArray(data) ? data : data.buildings;
        return json(res, 200, { ...scorePortfolio(buildings, ctx.benchmarks), sources: ctx.sources, benchmarks: ctx.benchmarks });
      }
      if (req.method === 'POST' && url.pathname === '/api/score') {
        const data = parseSingle(await body(req));
        return json(res, 200, scoreBuilding(data && typeof data === 'object' && data.building ? data.building : data, ctx.benchmarks));
      }
      if (req.method === 'POST' && url.pathname === '/api/import') {
        const filename = url.searchParams.get('filename') || req.headers['x-filename'] || '';
        const rows = await importRows(await body(req), filename);
        return json(res, 200, { ...scorePortfolio(rows, ctx.benchmarks), sources: ctx.sources, benchmarks: ctx.benchmarks, imported: filename });
      }
      if(req.method==='POST'&&url.pathname==='/api/fragments'){
        const name=String(url.searchParams.get('filename')||'').slice(0,240),buffer=await body(req),rows=await importRows(buffer,name,true);
        if(!rows.length||rows.length>5000)throw new ValidationError(['Each fragmented dataset must contain 1–5,000 rows.']);
        expireFragments();const bytes=Buffer.byteLength(JSON.stringify(rows));
        if(fragments.size>=50||[...fragments.values()].reduce((n,f)=>n+f.bytes,0)+bytes>MAX_FRAGMENT_MEMORY)throw new ValidationError(['The local upload workspace is full. Remove unused source files or restart the local server.']);
        const file={id:randomUUID(),name,rows,bytes,sha256:createHash('sha256').update(buffer).digest('hex'),accessed:Date.now()};fragments.set(file.id,file);
        return json(res,200,{file:describeFragment(file),fields:MERGE_FIELDS,expires_in_minutes:30});
      }
      if(req.method==='DELETE'&&url.pathname.startsWith('/api/fragments/')){fragments.delete(url.pathname.slice('/api/fragments/'.length));return json(res,200,{removed:true});}
      if(req.method==='POST'&&['/api/merge','/api/merge/export'].includes(url.pathname)){
        const spec=parseSingle(await body(req));if(!spec||typeof spec!=='object')throw new ValidationError(['A merge configuration is required.']);
        const files=fragmentSelection(spec),report=mergeFragments(files,{defaultYear:spec.defaultYear,resolutions:spec.resolutions||{},benchmarks:ctx.benchmarks});
        if(url.pathname==='/api/merge')return json(res,200,report);
        const result=await exportMerge(report,files,spec.format,path.join(ROOT,'work','exports'),spec.defaultYear??2023);
        res.writeHead(200,{'Content-Type':result.type,'Content-Disposition':`attachment; filename="${result.name}"`,'Content-Length':result.body.length,'Cache-Control':'no-store'});return res.end(result.body);
      }
      return json(res, 404, { error: 'API endpoint not found.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
    const decoded = decodeURIComponent(url.pathname);
    const isDoc = decoded.startsWith('/docs/');
    const base = isDoc ? path.join(ROOT, 'docs') : PUBLIC;
    const relative = isDoc ? decoded.slice(5) : decoded === '/' ? '/index.html' : decoded;
    const file = path.resolve(base, '.' + relative);
    if (!file.startsWith(base + path.sep) || decoded.includes('\0')) return json(res, 403, { error: 'Invalid path.' });
    const info = await stat(file);
    if (!info.isFile()) return json(res, 404, { error: 'File not found.' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'File not found. Build the public database first if sample data is missing.' });
    if (error instanceof ValidationError) return json(res, error.status || 422, { error: error.message, issues: error.issues });
    if (error instanceof URIError) return json(res, 400, { error: 'Invalid request path.' });
    console.error(error);
    return json(res, 500, { error: 'Unable to process the request. Check the server log for details.' });
  }
});
function parseSingle(buffer) {
  try { return JSON.parse(buffer.toString('utf8')); }
  catch { throw new ValidationError(['Request must contain valid JSON.']); }
}
server.listen(PORT, HOST, () => console.log(`Riskalytics Property Intelligence\nLocal: http://${HOST}:${PORT}\nModel: ${MODEL_VERSION}`));
