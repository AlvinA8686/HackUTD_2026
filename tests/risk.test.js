import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBuilding, scorePortfolio, WEIGHTS, PARAMETERS } from '../src/risk.js';
import { parseCSV, parseJSON } from '../src/import.js';
const sample = {
  building_id: 'test', name: 'Worked example', building_type: 'Technology', report_year: 2023, annual_revenue_usd: 100000000,
  electricity_kwh_sqft: 60, electricity_change_pct: 30, water_gal_sqft: 75, water_change_pct: 10,
  thermal_kbtu_sqft: 90, building_age_years: 60, hot_days: 30, freeze_days: 60,
  reference_electricity_kwh_sqft: 30, reference_water_gal_sqft: 50, reference_thermal_kbtu_sqft: 60,
};
const score = b => scoreBuilding(b).scores;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} differs from ${b}`);
test('worked example matches independently calculated subclasses and each exact weight set', () => {
  const s = score(sample); close(s.electricity, 90); close(s.plumbing, 48.75); close(s.hvacBase, 55.41666666666667); close(s.hvac, 67.9); close(s.revenue, 50);
  const expected = { Technology: 68.065, Healthcare: 68.875, Commercial: 65.7075, Residential: 66.8125, Industrial: 65.56, Institutional: 71.895 };
  for (const [type, overall] of Object.entries(expected)) { close(score({ ...sample, building_type: type }).overall, overall); close(Object.values(WEIGHTS[type]).reduce((a,b) => a+b), 1); }
});
test('electricity cascades into HVAC only, never plumbing, and HVAC does not feed electricity', () => {
  const low = score({ ...sample, electricity_kwh_sqft: 24, electricity_change_pct: 0 });
  const high = score(sample); assert.ok(high.electricity > low.electricity); assert.ok(high.hvac > low.hvac); close(high.plumbing, low.plumbing); close(low.cascadeBoost, 0);
  const hot = score({ ...sample, thermal_kbtu_sqft: 150, hot_days: 60 });
  close(hot.electricity, high.electricity); close(hot.plumbing, high.plumbing); assert.ok(hot.hvac > high.hvac);
  const water = score({ ...sample, water_gal_sqft: 200, water_change_pct: 100 }); close(water.electricity, high.electricity); close(water.hvac, high.hvac);
});
test('every score stays bounded and revenue always increases final score with other inputs fixed', () => {
  let prior = -1;
  for (const annual_revenue_usd of [0, 1, 1000, 1e6, 1e8, 1e10, 1e15]) {
    const s = score({ ...sample, annual_revenue_usd }); assert.ok(s.overall > prior); prior = s.overall;
  }
  for (let i = 0; i < 100; i++) {
    const s = score({ ...sample, electricity_kwh_sqft: i*5, electricity_change_pct: i-50, water_gal_sqft: i*10, water_change_pct: i-50, thermal_kbtu_sqft: i*20, building_age_years: i*2, hot_days: i, freeze_days: i*2 });
    for (const key of ['electricity','plumbing','hvacBase','hvac','revenue','overall']) assert.ok(s[key] >= 0 && s[key] <= 100, key);
  }
});
test('missing, impossible, nonfinite and mismatched-time data are not silently scored', () => {
  for (const p of PARAMETERS) for (const value of ['', null, undefined, true, NaN, Infinity, ' ']) assert.throws(() => score({ ...sample, [p.key]: value }), /required|finite/);
  assert.throws(() => score({ ...sample, hot_days: 366 }), /days in report_year/);
  assert.throws(() => score({ ...sample, weather_year: 2022 }), /Weather year/);
  assert.throws(() => score({ ...sample, reference_water_gal_sqft: 0 }), /greater than zero/);
  assert.throws(() => score({ ...sample, reference_water_gal_sqft: true }), /greater than zero/);
  assert.throws(() => score({ ...sample, reference_water_gal_sqft: [50] }), /greater than zero/);
  assert.throws(() => score({ ...sample, electricity_change_pct: -101 }), /between/);
  assert.throws(() => score({ ...sample, building_type: '__proto__' }), /building_type/);
});
test('a shared location/year weather conflict invalidates all conflicting records', () => {
  const r = scorePortfolio([{ ...sample, weather_key: 'NYC-2023' }, { ...sample, building_id: 'second', weather_key: 'NYC-2023', hot_days: 31 }]);
  assert.equal(r.summary.invalid, 2); assert.ok(r.results.every(x => /Conflicting weather/.test(x.error)));
  const clean = scorePortfolio([{ ...sample, weather_key: 'NYC-2023' }, { ...sample, building_id: 'second', weather_key: 'NYC-2023' }]); assert.equal(clean.summary.scored, 2);
});
test('partial imports retain row errors while scoring valid records', () => {
  const r = scorePortfolio([sample, { ...sample, building_id: 'bad', water_gal_sqft: '' }]); assert.equal(r.summary.scored,1); assert.equal(r.summary.invalid,1); assert.equal(r.results[1].row,2);
  const d = scorePortfolio([sample,sample]); assert.equal(d.summary.invalid,2);
  const malformed=scorePortfolio([null,{...sample,name:{toString:null}},{...sample,building_id:{toString:null},weather_key:{toString:null}}]);assert.equal(malformed.summary.invalid,3);
});
test('CSV parser handles commas, escaped quotes, CRLF, BOM, blank lines and multiline values', () => {
  const csv = '\uFEFFname,city\r\n"Tower, \"\"A\"\"","New\nYork"\r\n\r\n';
  assert.deepEqual(parseCSV(csv), [{name:'Tower, "A"',city:'New\nYork'}]);
  assert.throws(() => parseCSV('name,name\na,b'), /unique/); assert.throws(() => parseCSV('a,b\n"oops,b'), /unclosed/); assert.throws(() => parseCSV('a,b\n1,2,3'), /expected/);
  assert.deepEqual(parseJSON('{"buildings":[{"name":"A"}]}'), [{name:'A'}]); assert.throws(() => parseJSON('{}'), /array/); assert.throws(() => parseJSON('null'), /array/);
});
