import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
let child, base;
before(async () => {
  const port = 20000 + Math.floor(Math.random() * 20000); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore','pipe','pipe'] });
  await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => setTimeout(() => reject(new Error('Server did not start')), 5000).unref())]);
});
after(() => child?.kill());
test('default portfolio serves 30 real records and valid scores in all six classes', async () => {
  const response = await fetch(base + '/api/portfolio'); assert.equal(response.status,200);
  const data = await response.json(); assert.equal(data.summary.total,30); assert.equal(data.summary.invalid,0); assert.equal(new Set(data.results.map(r=>r.building.building_type)).size,6);
});
test('CSV and JSON imports round-trip identical scores and malformed shapes return 422', async () => {
  const totals = [];
  for (const name of ['buildings.csv','buildings.json']) {
    const response = await fetch(`${base}/api/import?filename=${name}`, {method:'POST',body:await readFile('public/data/'+name)});
    assert.equal(response.status,200); const data = await response.json(); assert.equal(data.summary.scored,30); totals.push(data.results.map(r=>r.scores.overall));
  }
  assert.deepEqual(totals[0],totals[1]);
  for (const [route, payload] of [['/api/import?filename=a.json','null'],['/api/score','null']]) {
    const response=await fetch(base+route,{method:'POST',body:payload}); assert.equal(response.status,422);
  }
});
test('SQLite uploads score the full clean database, with matching CSV results', async () => {
  const totals=[];
  for (const name of ['buildings.sqlite','all-buildings.csv']) {
    const response=await fetch(`${base}/api/import?filename=${name}`,{method:'POST',body:await readFile('public/data/'+name)});
    assert.equal(response.status,200); const data=await response.json(); assert.equal(data.summary.scored,2976); assert.equal(data.summary.invalid,0);
    totals.push(data.results.map(r=>[r.building.building_id,r.scores.overall]).sort((a,b)=>a[0].localeCompare(b[0])));
  }
  assert.deepEqual(totals[0],totals[1]);
});
test('invalid rows stay visible and file/path validation prevents unsupported access', async () => {
  const records=JSON.parse(await readFile('public/data/buildings.json','utf8')); records[0].water_gal_sqft='';
  const response=await fetch(base+'/api/import?filename=bad.json',{method:'POST',body:JSON.stringify(records)});
  const data=await response.json(); assert.equal(data.summary.invalid,1); assert.ok(data.results[0].error.includes('water_gal_sqft'));
  assert.equal((await fetch(base+'/api/import?filename=x.exe',{method:'POST',body:'test'})).status,422);
  assert.equal((await fetch(base+'/docs/%2e%2e%2fserver.js')).status,403);
  assert.equal((await fetch(base+'/api/score',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/docs/METHODOLOGY.md')).status,200);
});
