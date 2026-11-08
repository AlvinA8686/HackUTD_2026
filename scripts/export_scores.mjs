import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scorePortfolio, scoreBuilding, WEIGHTS } from '../src/risk.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const records=JSON.parse(await readFile(path.join(root,'data/clean_buildings.json'),'utf8'));
const benchmarks=JSON.parse(await readFile(path.join(root,'public/data/benchmarks.json'),'utf8'));
const portfolio=scorePortfolio(records,benchmarks);
if(portfolio.summary.invalid) throw new Error(`Invalid scored rows: ${portfolio.summary.invalid}`);
const columns=['building_id','name','address','building_type','property_type','report_year','annual_revenue_usd','revenue_source','electricity','plumbing','hvacBase','cascadeBoost','hvac','revenue','overall','band','electricity_contribution','plumbing_contribution','hvac_contribution','revenue_contribution','model_version'];
const escape=v=>{let text=String(v??'');if(typeof v!=='number'&&/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
const lines=[columns.map(escape).join(',')];
for(const {building:b,scores:s} of portfolio.results) {
  const row={...b,...s,model_version:s.modelVersion};
  for(const k of ['electricity','plumbing','hvac','revenue']) row[k+'_contribution']=s.contributions[k];
  lines.push(columns.map(k=>escape(row[k])).join(','));
}
await writeFile(path.join(root,'public/data/scored-buildings.csv'),lines.join('\r\n')+'\r\n');
const example={building_id:'worked-example',name:'Worked example (illustrative inputs)',building_type:'Technology',report_year:2023,annual_revenue_usd:100000000,revenue_source:'scenario',electricity_kwh_sqft:60,electricity_change_pct:30,water_gal_sqft:75,water_change_pct:10,thermal_kbtu_sqft:90,building_age_years:60,hot_days:30,freeze_days:60,reference_electricity_kwh_sqft:30,reference_water_gal_sqft:50,reference_thermal_kbtu_sqft:60,reference_label:'Illustrative fixed references'};
const results=Object.keys(WEIGHTS).map(building_type=>scoreBuilding({...example,building_type}));
await writeFile(path.join(root,'public/data/worked-example.json'),JSON.stringify({note:'Illustrative arithmetic example; references and weather are scenario inputs, not source observations.',results},null,2));
console.log(JSON.stringify(portfolio.summary));
