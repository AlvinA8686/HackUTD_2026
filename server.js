import http from 'node:http';
import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { MODEL_VERSION, WEIGHTS, PARAMETERS, scoreBuilding, scorePortfolio, ValidationError } from './src/risk.js';
import { parseCSV, parseJSON } from './src/import.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MAX_BYTES = 10 * 1024 * 1024;
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
function sqliteRows(file) {
  const db = new DatabaseSync(file, { readOnly: true, enableLoadExtension: false });
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='buildings'").get();
    if (!table) throw new ValidationError(['SQLite database must contain a buildings table using the template field names.']);
    const columns = new Set(db.prepare('PRAGMA table_info(buildings)').all().map(c => c.name));
    const normalizedWeather = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='weather'").get();
    // Our normalized database stores station/year weather once, rather than duplicating it in each building.
    const rows = !columns.has('hot_days') && columns.has('weather_key') && normalizedWeather
      ? db.prepare('SELECT b.*, w.hot_days, w.freeze_days, w.weather_region FROM buildings b LEFT JOIN weather w ON b.weather_key = w.weather_key AND b.report_year = w.report_year LIMIT 5001').all()
      : db.prepare('SELECT * FROM buildings LIMIT 5001').all();
    return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
  } finally { db.close(); }
}
async function importRows(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.csv') return parseCSV(buffer.toString('utf8'));
  if (ext === '.json') return parseJSON(buffer.toString('utf8'));
  if (['.sqlite', '.sqlite3', '.db'].includes(ext)) {
    if (buffer.subarray(0, 16).toString('binary') !== 'SQLite format 3\u0000') throw new ValidationError(['File is not a SQLite 3 database.']);
    const folder = path.join(ROOT, 'work', 'uploads'); await mkdir(folder, { recursive: true });
    const file = path.join(folder, `${randomUUID()}.sqlite`);
    await writeFile(file, buffer);
    try { return sqliteRows(file); }
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
server.listen(PORT, HOST, () => console.log(`NEXUS Property Intelligence\nLocal: http://${HOST}:${PORT}\nModel: ${MODEL_VERSION}`));
