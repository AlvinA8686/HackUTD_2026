import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFile,unlink} from 'node:fs/promises';
import {mergeFragments,describeFragment} from '../src/merge.js';
import {exportMerge} from '../src/merge-export.js';
import {parseCSV} from '../src/import.js';
import {scoreBuilding} from '../src/risk.js';

const row={building_id:'A',name:'Building A',address:'100 Main Street',city:'Plano',state:'TX',report_year:2023,building_type:'Technology',annual_revenue_usd:100000000,revenue_source:'scenario',electricity_kwh_sqft:60,electricity_change_pct:30,water_gal_sqft:75,water_change_pct:10,thermal_kbtu_sqft:90,building_age_years:60,hot_days:30,freeze_days:60,reference_electricity_kwh_sqft:30,reference_water_gal_sqft:50,reference_thermal_kbtu_sqft:60};
const file=(id,rows,kind='building')=>{const f={id,name:id+'.json',rows,kind,sha256:'test-hash'};return {...f,mapping:describeFragment(f).mapping};};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('three fragmented sources join by ID/year and shared location/year and derive required inputs',()=>{
 const files=[file('register',[{...row,electricity_kwh_sqft:undefined,electricity_change_pct:undefined,water_gal_sqft:undefined,water_change_pct:undefined,thermal_kbtu_sqft:undefined,hot_days:undefined,freeze_days:undefined,building_age_years:undefined,year_built:1963,floor_area_sqft:1000}]),file('utility',[{building_id:'A',report_year:2023,electricity_kwh:60000,water_kgal:75,thermal_kbtu:90000,previous_report_year:2022,previous_electricity_kwh_sqft:60/1.3,previous_water_gal_sqft:75/1.1}]),file('weather',[{city:'Plano',state:'TX',year:2023,hot_days:30,freeze_days:60}],'weather')];
 const report=mergeFragments(files);assert.equal(report.summary.total,1);assert.equal(report.summary.scored,1);assert.equal(report.summary.input_rows,3);
 const r=report.results[0];close(r.scores.overall,74.193);close(r.scores.electricity,90);close(r.scores.plumbing,48.75);close(r.scores.hvac,67.9);
 assert.ok(r.building.provenance.merge.water_gallons[0].transformation.includes('1,000'));assert.equal(r.building.building_age_years,60);
});
test('column aliases and explicit column mapping support heterogeneous headers without guessing unknown units',()=>{
 const a=file('one',[{...row,'Electricity Use (kWh)':60000,floor_area_sqft:1000}]);delete a.rows[0].electricity_kwh_sqft;
 const b=file('two',[{'Custom Asset Key':'A','Custom Water':75}]);b.mapping={'Custom Asset Key':'building_id','Custom Water':'water_gal_sqft'};
 const report=mergeFragments([a,b]);assert.equal(report.summary.scored,1);close(report.results[0].scores.overall,74.193);
});
test('address matching respects city/state/year and supports common street suffixes',()=>{
 const a=file('one',[{...row,electricity_kwh_sqft:undefined}]);
 const b=file('two',[{address:'100 MAIN ST.',city:'PLANO',state:'TX',report_year:2023,electricity_kwh_sqft:60}]);
 assert.equal(mergeFragments([a,b]).summary.scored,1);
 b.rows[0].city='Dallas';const report=mergeFragments([a,b]);assert.equal(report.summary.total,2);assert.equal(report.summary.scored,0);
});
test('different strong IDs at one address are not collapsed and an address-only row is flagged ambiguous',()=>{
 const report=mergeFragments([file('one',[row,{...row,building_id:'B'}]),file('two',[{address:row.address,city:row.city,state:row.state,report_year:2023,electricity_kwh_sqft:60}])]);
 assert.equal(report.summary.total,3);assert.match(report.results[2].error,/multiple IDs/);
});
test('conflicts block scoring until an explicit source choice is made and retain both source observations',()=>{
 const files=[file('one',[row]),file('two',[{building_id:'A',report_year:2023,water_gal_sqft:150}])];
 const review=mergeFragments(files);assert.equal(review.summary.scored,0);assert.equal(review.summary.unresolved_conflicts,1);
 const c=review.conflicts[0];assert.equal(c.field,'water_gal_sqft');assert.equal(c.candidates.length,2);
 const resolved=mergeFragments(files,{resolutions:{[c.id]:0}});assert.equal(resolved.summary.scored,1);assert.equal(resolved.conflicts[0].resolved,true);close(resolved.results[0].scores.overall,74.193);
 assert.equal(resolved.results[0].building.provenance.merge.water_gal_sqft.length,2);
});
test('revenue differences of even one cent are not hidden by numeric tolerance',()=>{
 const report=mergeFragments([file('one',[{...row,annual_revenue_usd:1000000000}]),file('two',[{building_id:'A',report_year:2023,annual_revenue_usd:1000000000.01}])]);
 assert.equal(report.summary.scored,0);assert.equal(report.conflicts[0].field,'annual_revenue_usd');
});
test('malformed mapping values are rejected as validation errors',()=>{
 const input=file('one',[row]);input.mapping={building_id:{toString:null}};
 assert.throws(()=>mergeFragments([input]),/unsupported mapped field/);
});
test('one shared weather conflict flags every affected building and resolves consistently',()=>{
 const buildings=file('register',[{...row,weather_key:'TEST:2023'},{...row,building_id:'B',name:'B',address:'200 Main St',weather_key:'TEST:2023'}]);
 const wx=file('weather',[{weather_key:'TEST:2023',report_year:2023,hot_days:40,freeze_days:60}],'weather');
 const report=mergeFragments([buildings,wx]);assert.equal(report.summary.scored,0);
 const c=report.conflicts.find(c=>c.field==='hot_days');assert.equal(c.scope,'weather');assert.equal(c.affected.length,2);
 const resolved=mergeFragments([buildings,wx],{resolutions:{[c.id]:0}});assert.equal(resolved.summary.scored,2);
 assert.equal(resolved.results[0].building.hot_days,resolved.results[1].building.hot_days);
});
test('weather joins do not cross years and missing climate values never become zero',()=>{
 const b={...row};delete b.hot_days;delete b.freeze_days;
 const report=mergeFragments([file('one',[b]),file('weather',[{city:'Plano',state:'TX',report_year:2024,hot_days:40,freeze_days:50}],'weather')]);
 assert.equal(report.summary.scored,0);assert.match(report.results[0].error,/hot_days.*required/);
});
test('calculated totals disagreeing with declared intensities are surfaced and invalid trends remain unscored',()=>{
 let report=mergeFragments([file('one',[{...row,electricity_kwh:90000,floor_area_sqft:1000}])]);assert.equal(report.summary.scored,0);assert.equal(report.conflicts[0].field,'electricity_kwh_sqft');
 const noTrend={...row,previous_electricity_kwh_sqft:30};delete noTrend.electricity_change_pct;
 report=mergeFragments([file('one',[noTrend])]);assert.equal(report.summary.scored,0);assert.match(report.results[0].error,/previous_report_year/);
});
test('invalid rows and unmapped columns remain in the quality report',()=>{
 const report=mergeFragments([file('one',[null,{...row,extra_unknown:'retained in original source'}])]);
 assert.equal(report.summary.total,2);assert.equal(report.summary.scored,1);assert.ok(report.warnings.some(w=>w.includes('extra_unknown')));
});
test('shared weather provenance is stored once rather than duplicated for every building',()=>{
 const rows=Array.from({length:200},(_,i)=>({...row,building_id:'B'+i,address:i+' Main St',weather_key:'TEST:2023'}));
 const report=mergeFragments([file('portfolio',rows)]);assert.equal(report.summary.scored,200);
 assert.equal(report.weather_provenance['TEST:2023'].hot_days.length,200);
 assert.ok(report.results[0].building.provenance.merge.hot_days.length<=2);
 assert.ok(JSON.stringify(report).length<4000000,'Shared provenance should grow linearly');
});
test('clean SQLite, JSON and CSV downloads include scored rows and preserve exclusions and lineage',async()=>{
 const files=[file('one',[row,{...row,building_id:'B',water_gal_sqft:null}])],report=mergeFragments(files);
 assert.equal(report.summary.scored,1);
 const json=await exportMerge(report,files,'json','work/merge-test',2023),data=JSON.parse(json.body);
 assert.equal(data.buildings.length,1);assert.equal(data.metadata.excluded_buildings,1);close(data.buildings[0].building_score,74.193);
 const csv=await exportMerge(report,files,'csv','work/merge-test',2023),parsed=parseCSV(csv.body.toString('utf8'));assert.equal(parsed.length,1);close(scoreBuilding(parsed[0]).scores.overall,74.193);
 const sqlite=await exportMerge(report,files,'sqlite','work/merge-test',2023),name='work/merge-test/reimport.sqlite';await writeFile(name,sqlite.body);
 const db=new DatabaseSync(name,{readOnly:true});
 try{assert.equal(db.prepare('SELECT COUNT(*) n FROM buildings').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM merge_issues').get().n,1);assert.ok(db.prepare('SELECT COUNT(*) n FROM field_provenance').get().n>10);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');const b=db.prepare('SELECT * FROM buildings').get();close(scoreBuilding(b).scores.overall,74.193);}finally{db.close();await unlink(name);}
});
