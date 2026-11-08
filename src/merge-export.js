import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {MERGE_FIELDS} from './merge.js';
import {MODEL_VERSION,ValidationError} from './risk.js';

const scoreColumns=['electricity_score','plumbing_score','hvac_base_score','hvac_cascade_points','hvac_score','revenue_score','building_score','priority','model_version'];
const inputColumns=[...new Set([...MERGE_FIELDS.map(f=>f.key),'source_files'])].filter(k=>!['mean_temperature_f','water_kgal','previous_water_kgal'].includes(k));
function flat(result){const b=result.building,s=result.scores;return {...b,electricity_score:s.electricity,plumbing_score:s.plumbing,hvac_base_score:s.hvacBase,hvac_cascade_points:s.cascadeBoost,hvac_score:s.hvac,revenue_score:s.revenue,building_score:s.overall,priority:s.band,model_version:s.modelVersion,provenance_json:JSON.stringify(b.provenance)};}
function csvCell(value){let s=String(value??'');if(typeof value!=='number'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export async function exportMerge(report,files,format,folder,defaultYear){
  if(format==='report')return {body:Buffer.from(JSON.stringify(report,null,2)),type:'application/json',name:'merge-review-report.json'};
  const valid=report.results.filter(r=>r.scores);
  if(!valid.length)throw new ValidationError(['No clean, fully scored buildings are available. Resolve conflicts and supply the missing parameters first.']);
  const rows=valid.map(flat),metadata={model_version:MODEL_VERSION,default_report_year:Number(defaultYear),exported_at:new Date().toISOString(),clean_buildings:valid.length,excluded_buildings:report.results.length-valid.length,unresolved_conflicts:report.summary.unresolved_conflicts,source_files:files.length};
  if(format==='json')return {body:Buffer.from(JSON.stringify({metadata,buildings:rows,sources:report.sources,weather_provenance:report.weather_provenance,excluded:report.results.filter(r=>!r.scores).map(r=>({building_id:r.building.building_id,report_year:r.building.report_year,issues:r.issues}))},null,2)),type:'application/json',name:'clean-building-database.json'};
  const columns=[...inputColumns,...scoreColumns,'provenance_json'];
  if(format==='csv')return {body:Buffer.from('\uFEFF'+[columns.map(csvCell).join(','),...rows.map(row=>columns.map(key=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n'),type:'text/csv; charset=utf-8',name:'clean-building-database.csv'};
  if(format!=='sqlite')throw new ValidationError(['Choose sqlite, csv, json or report as the download format.']);
  await mkdir(folder,{recursive:true});const filename=path.join(folder,`${randomUUID()}.sqlite`);let db;
  try{
    db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON; BEGIN;');
    db.exec(`CREATE TABLE metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE sources (source_id TEXT PRIMARY KEY,filename TEXT NOT NULL,sha256 TEXT,record_count INTEGER,mapping_json TEXT,kind TEXT);
      CREATE TABLE source_records (source_id TEXT NOT NULL REFERENCES sources(source_id),source_row INTEGER NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(source_id,source_row));
      CREATE TABLE conflicts (conflict_id TEXT PRIMARY KEY,scope TEXT,record_key TEXT,field TEXT,resolved INTEGER,selected_candidate INTEGER,details_json TEXT);
      CREATE TABLE merge_issues (merge_key TEXT,building_id TEXT,report_year INTEGER,issues_json TEXT);
      CREATE TABLE field_provenance (merge_key TEXT,building_id TEXT,report_year INTEGER,field TEXT,observations_json TEXT);
      CREATE TABLE weather_provenance (weather_key TEXT,field TEXT,observations_json TEXT);`);
    // Fixed, application-owned column names. Uploaded text is bound as data only.
    db.exec(`CREATE TABLE buildings (${columns.map(k=>`"${k}" ${['report_year','year_built','building_age_years','hot_days','freeze_days','weather_year','previous_report_year','reference_year','reference_count'].includes(k)?'INTEGER':scoreColumns.includes(k)&&!['priority','model_version'].includes(k)||!['building_id','property_id','name','address','city','state','postal_code','building_type','property_type','weather_key','station_id','weather_region','revenue_source','reference_label','benchmark_version','thermal_coverage','electricity_coverage','source_files','priority','model_version','provenance_json'].includes(k)?'REAL':'TEXT'}`).join(',')},PRIMARY KEY(building_id,report_year));`);
    const insert=db.prepare(`INSERT INTO buildings (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
    for(const row of rows)insert.run(...columns.map(k=>row[k]??null));
    const meta=db.prepare('INSERT INTO metadata VALUES (?,?)');for(const [key,value]of Object.entries(metadata))meta.run(key,String(value));
    const source=db.prepare('INSERT INTO sources VALUES (?,?,?,?,?,?)'),record=db.prepare('INSERT INTO source_records VALUES (?,?,?)');
    for(const file of files){source.run(file.id,file.name,file.sha256||'',file.rows.length,JSON.stringify(file.mapping||{}),file.kind);file.rows.forEach((row,index)=>record.run(file.id,index+1,JSON.stringify(row)));}
    const conflict=db.prepare('INSERT INTO conflicts VALUES (?,?,?,?,?,?,?)');
    for(const c of report.conflicts)conflict.run(c.id,c.scope,c.record_key,c.field,c.resolved?1:0,c.selected,JSON.stringify(c));
    const issue=db.prepare('INSERT INTO merge_issues VALUES (?,?,?,?)'),provenance=db.prepare('INSERT INTO field_provenance VALUES (?,?,?,?,?)');
    for(const r of report.results){if(r.issues?.length)issue.run(r.merge_key,r.building.building_id,r.building.report_year??null,JSON.stringify(r.issues));for(const [field,values]of Object.entries(r.building.provenance?.merge||{}))provenance.run(r.merge_key,r.building.building_id,r.building.report_year??null,field,JSON.stringify(values));}
    for(const row of report.orphan_rows)issue.run(null,null,null,JSON.stringify(row));
    const shared=db.prepare('INSERT INTO weather_provenance VALUES (?,?,?)');for(const [key,fields]of Object.entries(report.weather_provenance||{}))for(const [field,observations]of Object.entries(fields))shared.run(key,field,JSON.stringify(observations));
    db.exec('COMMIT;');db.close();db=null;
    return {body:await readFile(filename),type:'application/vnd.sqlite3',name:'clean-building-database.sqlite'};
  }finally{db?.close();await unlink(filename).catch(()=>{});}
}
