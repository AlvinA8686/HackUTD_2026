import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
let child,base,spec,baseline;
before(async()=>{
 const port=31000+Math.floor(Math.random()*4000);base=`http://127.0.0.1:${port}`;
 child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server did not start')),5000).unref())]);
 baseline=await (await fetch(base+'/api/portfolio')).json();
 const files=[];for(const name of ['building-register.csv','utility-records.csv','shared-weather.csv'])files.push(await upload(name));
 spec={files:files.map(f=>({id:f.id,kind:f.kind,mapping:f.mapping})),defaultYear:2023,resolutions:{}};
});
after(()=>child?.kill());
async function upload(name){const response=await fetch(base+'/api/fragments?filename='+name,{method:'POST',body:await readFile('public/data/fragments/'+name)});assert.equal(response.status,200);return (await response.json()).file;}
const post=(route,value)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(value)});
test('three separately uploaded fragments reproduce the real demo portfolio scores',async()=>{
 const response=await post('/api/merge',spec);assert.equal(response.status,200);const report=await response.json();
 assert.equal(report.summary.scored,30);assert.equal(report.summary.total,30);assert.equal(report.summary.source_files,3);assert.equal(report.summary.unresolved_conflicts,0);
 for(const row of report.results){const original=baseline.results.find(r=>r.building.building_id===row.building.building_id);assert.equal(row.scores.overall,original.scores.overall);}
});
test('shared weather conflict is flagged for all buildings then one choice resolves all records',async()=>{
 const conflict=await upload('conflicting-weather.csv');const configured={...spec,files:[...spec.files,{id:conflict.id,kind:conflict.kind,mapping:conflict.mapping}]};
 let report=await (await post('/api/merge',configured)).json();assert.equal(report.summary.invalid,30);assert.equal(report.summary.unresolved_conflicts,1);
 const c=report.conflicts[0];assert.equal(c.field,'hot_days');assert.equal(c.affected.length,30);
 const choice=c.candidates.findIndex(v=>v.value===12);configured.resolutions={[c.id]:choice};
 report=await (await post('/api/merge',configured)).json();assert.equal(report.summary.scored,30);assert.equal(report.summary.resolved_conflicts,1);assert.ok(report.results.every(r=>r.building.hot_days===12));
});
test('clean CSV/JSON/SQLite downloads round-trip through the existing import API',async()=>{
 for(const format of ['csv','json','sqlite']){
  const response=await post('/api/merge/export',{...spec,format});assert.equal(response.status,200);assert.match(response.headers.get('Content-Disposition'),/clean-building-database/);
  const body=Buffer.from(await response.arrayBuffer());
  const imported=await fetch(base+'/api/import?filename=clean.'+format,{method:'POST',body});assert.equal(imported.status,200);
  const scored=await imported.json();assert.equal(scored.summary.scored,30);assert.equal(scored.summary.invalid,0);
  if(format==='sqlite'){const name='work/merge-test/api-clean.sqlite';await writeFile(name,body);const db=new DatabaseSync(name,{readOnly:true});try{assert.equal(db.prepare('SELECT COUNT(*) n FROM sources').get().n,3);assert.equal(db.prepare('SELECT COUNT(*) n FROM source_records').get().n,61);assert.ok(db.prepare('SELECT COUNT(*) n FROM field_provenance').get().n>300);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();await unlink(name);}}
 }
});
test('expired/removed uploads, malformed selections and unsupported output formats fail clearly',async()=>{
 assert.equal((await post('/api/merge',{files:[null]})).status,422);
 assert.equal((await post('/api/merge',{...spec,files:[{id:'not-uploaded',kind:'building'}]})).status,422);
 assert.equal((await post('/api/merge/export',{...spec,format:'executable'})).status,422);
 const extra=await upload('conflicting-weather.csv');await fetch(base+'/api/fragments/'+extra.id,{method:'DELETE'});
 assert.equal((await post('/api/merge',{...spec,files:[{id:extra.id}]})).status,422);
});
test('the full 2,976-building SQLite portfolio can be merged without duplicating shared weather provenance',async()=>{
 const upload=await fetch(base+'/api/fragments?filename=full.sqlite',{method:'POST',body:await readFile('public/data/buildings.sqlite')});assert.equal(upload.status,200);const file=(await upload.json()).file;
 const response=await post('/api/merge',{files:[{id:file.id,kind:file.kind,mapping:file.mapping}],defaultYear:2023});assert.equal(response.status,200);
 const text=await response.text();assert.ok(text.length<50000000);const report=JSON.parse(text);assert.equal(report.summary.scored,2976);assert.equal(report.summary.invalid,0);
});
