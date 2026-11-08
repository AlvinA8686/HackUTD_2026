import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
test('retained fragmented snapshots match their source manifests', async () => {
  const sources=JSON.parse(await readFile('public/data/sources.json','utf8'));
  for(const source of sources) {
    const bytes=gunzipSync(await readFile(source.raw_file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256_uncompressed);
    assert.equal(JSON.parse(bytes).length,source.record_count);
    assert.ok(source.query_url.startsWith('https://'));
  }
});
test('display records reconcile actual source measurements, year joins and shared weather', async () => {
  const sample=JSON.parse(await readFile('public/data/buildings.json','utf8'));
  const current=JSON.parse(gunzipSync(await readFile('data/raw/nyc_ll84_2023.json.gz')));
  const prior=JSON.parse(gunzipSync(await readFile('data/raw/nyc_ll84_2022.json.gz')));
  const close=(a,b)=>assert.ok(Math.abs(a-b)<0.0000011,`${a} != ${b}`);
  for(const b of sample) {
    const c=current[b.provenance.current.raw_row_index], p=prior[b.provenance.prior.raw_row_index];
    assert.equal(c.property_id,b.property_id); assert.equal(p.property_id,b.property_id);
    assert.equal(c.primary_property_type,b.property_type); assert.equal(c.nyc_building_identification,p.nyc_building_identification);
    const field=b.provenance.electricity_field;
    close(b.electricity_kwh_sqft,Number(c[field])/Number(c.property_gfa_calculated_1));
    close(b.water_gal_sqft,1000*Number(c.water_use_all_water_sources)/Number(c.property_gfa_calculated_1));
    const e0=Number(p[field])/Number(p.property_gfa_calculated_1), w0=1000*Number(p.water_use_all_water_sources)/Number(p.property_gfa_calculated_1);
    close(b.electricity_change_pct,100*((Number(c[field])/Number(c.property_gfa_calculated_1))/e0-1));
    close(b.water_change_pct,100*((1000*Number(c.water_use_all_water_sources)/Number(c.property_gfa_calculated_1))/w0-1));
    assert.equal(b.building_age_years,2023-Number(c.year_built));
    assert.equal(b.weather_year,2023); assert.equal(b.hot_days,12); assert.equal(b.freeze_days,23);
    assert.equal(b.revenue_source,'scenario'); assert.ok(b.reference_electricity_kwh_sqft>0);
  }
});
