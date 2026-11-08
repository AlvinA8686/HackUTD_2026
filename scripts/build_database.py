"""Rebuild the auditable demo database from checked-in public-data snapshots.

No third-party Python packages required. This script does not fetch the network;
use fetch_data.py to explicitly refresh snapshots, then run this script.
"""
from __future__ import annotations
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
from pathlib import Path
import sqlite3
import statistics

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw'
PUBLIC = ROOT / 'public' / 'data'
YEAR = 2023
TYPE_MAP = {
    'Data Center': 'Technology',
    'Hospital (General Medical & Surgical)': 'Healthcare',
    'Office': 'Commercial',
    'Multifamily Housing': 'Residential',
    'Manufacturing/Industrial Plant': 'Industrial',
    'K-12 School': 'Institutional',
}
THERMAL_FIELDS = (
    'natural_gas_use_kbtu', 'district_steam_use_kbtu',
    'district_hot_water_use_kbtu', 'district_chilled_water_use',
    'fuel_oil_1_use_kbtu', 'fuel_oil_2_use_kbtu',
    'fuel_oil_4_use_kbtu', 'fuel_oil_5_6_use_kbtu',
    'diesel_2_use_kbtu', 'propane_use_kbtu', 'kerosene_use_kbtu',
)
MEASURES = ('electricity_kwh_sqft', 'water_gal_sqft', 'thermal_kbtu_sqft')

def load_raw(name):
    path = RAW / name
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    with gzip.open(str(path) + '.gz', 'rt', encoding='utf-8') as stream:
        return json.load(stream)

def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None

def unique_latest(rows):
    """Latest submitted row wins; hash breaks exact-timestamp ties reproducibly."""
    found = {}
    for index, row in enumerate(rows):
        key = row['property_id']
        order = (row.get('report_submission_date', ''), json.dumps(row, sort_keys=True))
        if key not in found or order > found[key][0]:
            found[key] = (order, index, row)
    return {key: (value[1], value[2]) for key, value in found.items()}

def clean(row, year):
    if number(row.get('report_year')) != year or not str(row.get('year_ending','')).startswith(str(year)+'-12-31'):
        return None
    if row.get('primary_property_type') not in TYPE_MAP:
        return None
    # A campus record may encompass many buildings: do not relabel it as one.
    if number(row.get('number_of_buildings')) != 1:
        return None
    if any(row.get(k) != 'Whole Property' for k in ('metered_areas_energy','metered_areas_water')):
        return None
    if any(row.get(k) != 'No' for k in ('estimated_values_energy','estimated_values_water')):
        return None
    for key in ('alert_energy_meter_has_less','alert_energy_meter_has_gaps','alert_energy_meter_has','alert_water_meter_has_less'):
        if row.get(key) != 'Ok':
            return None
    area = number(row.get('property_gfa_calculated_1'))
    if area is None or not 10000 <= area <= 5000000:
        return None
    electricity_field = 'electricity_use_grid_purchase_2'
    electricity = number(row.get(electricity_field))
    if electricity is None:
        electricity_field = 'electricity_use_grid_purchase_1'
        electricity = number(row.get(electricity_field))
    water = number(row.get('water_use_all_water_sources'))
    reported = {key:number(row.get(key)) for key in THERMAL_FIELDS if number(row.get(key)) is not None}
    if electricity is None or water is None or not reported or min(reported.values()) < 0:
        return None
    year_built = number(row.get('year_built'))
    if year_built is None or not 1800 <= year_built <= year:
        return None
    values = {
        'electricity_kwh_sqft': electricity / area,
        'water_gal_sqft': water * 1000 / area,
        'thermal_kbtu_sqft': sum(reported.values()) / area,
    }
    # Screens catch obvious unit/entry errors, not engineering safety thresholds.
    if not (0 < values['electricity_kwh_sqft'] <= 1000 and 0 < values['water_gal_sqft'] <= 1000 and 0 <= values['thermal_kbtu_sqft'] <= 2000):
        return None
    return {
        **values, 'floor_area_sqft': area, 'year_built': int(year_built),
        'electricity_source_field': electricity_field, 'thermal_reported_components': reported,
    }

def weather_summary(rows):
    days = {}
    for row in rows:
        if row['DATE'][:4] != str(YEAR) or row['STATION'] != 'USW00094728':
            continue
        hi, lo = number(row.get('TMAX')), number(row.get('TMIN'))
        if hi is None or lo is None or lo > hi:
            continue
        # NOAA attribute item 2 is the quality flag. Nonempty means failed QA.
        flagged = False
        for key in ('TMAX_ATTRIBUTES', 'TMIN_ATTRIBUTES'):
            attrs = row.get(key, '').split(',')
            if len(attrs) > 1 and attrs[1].strip():
                flagged = True
        if not flagged:
            days[row['DATE']] = (hi, lo)
    if len(days) != 365:
        raise ValueError(f'Expected 365 complete QA-passing station days, found {len(days)}')
    return {
        'weather_key': 'USW00094728:2023', 'station_id': 'USW00094728',
        'station_name': 'NY CITY CENTRAL PARK, NY US', 'report_year': YEAR,
        'weather_region': 'New York City regional station proxy',
        'hot_days': sum(hi >= 32 for hi,lo in days.values()),
        'freeze_days': sum(lo < 0 for hi,lo in days.values()),
        'mean_temperature_c': round(statistics.mean((hi+lo)/2 for hi,lo in days.values()),3),
        'max_temperature_c': max(hi for hi,lo in days.values()),
        'min_temperature_c': min(lo for hi,lo in days.values()),
        'observed_days': len(days), 'source_id': 'noaa_ghcnd_2023',
    }

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def build():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    current_raw = load_raw('nyc_ll84_2023.json')
    prior_raw = load_raw('nyc_ll84_2022.json')
    if len(current_raw) >= 50000 or len(prior_raw) >= 50000:
        raise ValueError('API query limit reached: paginate source downloads before rebuilding a complete reference cohort.')
    latest = unique_latest(current_raw)
    prior = unique_latest(prior_raw)
    weather = weather_summary(load_raw('noaa_central_park_2023.json'))
    cohorts = {kind: [] for kind in TYPE_MAP}
    eligible = []
    for property_id, (raw_index, row) in latest.items():
        values = clean(row, YEAR)
        if values is None:
            continue
        cohorts[row['primary_property_type']].append(values)
        if property_id not in prior:
            continue
        prior_index, older = prior[property_id]
        old_values = clean(older, YEAR-1)
        if old_values is None or older['primary_property_type'] != row['primary_property_type']:
            continue
        if old_values['electricity_source_field'] != values['electricity_source_field']:
            continue
        # Stable ID alone is insufficient when a property portfolio changes.
        if older.get('nyc_building_identification') != row.get('nyc_building_identification'):
            continue
        if older.get('nyc_borough_block_and_lot') != row.get('nyc_borough_block_and_lot'):
            continue
        if abs(old_values['floor_area_sqft']/values['floor_area_sqft']-1) > .10:
            continue
        eligible.append((property_id, raw_index, row, values, prior_index, older, old_values))
    benchmarks = {'version':'nyc-2023-v1','report_year':YEAR,'source_id':'nyc_ll84_2023','property_types':{},'building_types':{}}
    for property_type, cohort in cohorts.items():
        if len(cohort) < 5:
            raise ValueError(f'Insufficient peer cohort: {property_type}, n={len(cohort)}')
        reference = {measure:round(statistics.median(r[measure] for r in cohort),6) for measure in MEASURES}
        if any(value <= 0 for value in reference.values()):
            raise ValueError(f'Nonpositive peer reference for {property_type}')
        reference.update({'count':len(cohort),'property_type':property_type,'report_year':YEAR,'scope':'exact property type, NYC, 2023, screened single-building whole-property unestimated complete observations'})
        benchmarks['property_types'][property_type] = reference
        # Each broad class in this demo represents exactly this stated subtype.
        benchmarks['building_types'][TYPE_MAP[property_type]] = reference.copy()
    all_clean = []
    for property_id, raw_index, row, values, prior_index, older, old_values in eligible:
        kind = row['primary_property_type']
        ref = benchmarks['property_types'][kind]
        revenue_options = [10000000,50000000,100000000,250000000,750000000,2000000000]
        revenue = revenue_options[int(property_id) % len(revenue_options)]
        building = {
            'building_id':'NYC-' + property_id, 'property_id':property_id,
            'name':row['property_name'], 'address':row['address_1'],
            'city':'New York City', 'borough':row.get('borough',''), 'state':'NY',
            'postal_code':row.get('postal_code',''),
            'building_type':TYPE_MAP[kind], 'property_type':kind, 'report_year':YEAR,
            'annual_revenue_usd':revenue, 'revenue_source':'scenario',
            'revenue_note':'Illustrative client revenue scenario; not observed revenue or an asserted client relationship.',
            **{key:round(values[key],6) for key in MEASURES},
            'electricity_change_pct':round(100*(values['electricity_kwh_sqft']/old_values['electricity_kwh_sqft']-1),6),
            'water_change_pct':round(100*(values['water_gal_sqft']/old_values['water_gal_sqft']-1),6),
            'building_age_years':YEAR-values['year_built'], 'year_built':values['year_built'],
            'floor_area_sqft':values['floor_area_sqft'],
            'occupancy_pct':number(row.get('occupancy')),
            'hot_days':weather['hot_days'], 'freeze_days':weather['freeze_days'],
            'weather_key':weather['weather_key'], 'weather_region':weather['weather_region'],
            'latitude':number(row.get('latitude')), 'longitude':number(row.get('longitude')),
            'reference_electricity_kwh_sqft':ref['electricity_kwh_sqft'],
            'reference_water_gal_sqft':ref['water_gal_sqft'],
            'reference_thermal_kbtu_sqft':ref['thermal_kbtu_sqft'],
            'peer_count':ref['count'], 'reference_count':ref['count'],
            'reference_label':kind+' / New York City / 2023',
            'reference_year':YEAR, 'benchmark_version':benchmarks['version'],
            'weather_year':YEAR,
            'electricity_coverage':('Grid purchase plus consumed onsite renewable generation' if values['electricity_source_field']=='electricity_use_grid_purchase_2' else 'Grid purchase only; onsite generation unavailable'),
            'thermal_coverage':'Reported non-electric streams only; '+str(len(THERMAL_FIELDS)-len(values['thermal_reported_components']))+' streams unavailable, not observed zero; not isolated HVAC consumption',
            'source_ids':['nyc_ll84_2023','nyc_ll84_2022','noaa_ghcnd_2023'],
            'provenance':{
                'current':{'source_id':'nyc_ll84_2023','property_id':property_id,'raw_row_index':raw_index,'report_submission_date':row.get('report_submission_date')},
                'prior':{'source_id':'nyc_ll84_2022','property_id':property_id,'raw_row_index':prior_index,'report_submission_date':older.get('report_submission_date')},
                'electricity_field':values['electricity_source_field'],
                'water_field':'water_use_all_water_sources',
                'thermal_fields':list(values['thermal_reported_components']),
                'thermal_missing_streams':[key for key in THERMAL_FIELDS if key not in values['thermal_reported_components']],
                'weather':{'source_id':'noaa_ghcnd_2023','weather_key':weather['weather_key']},
                'revenue':'scenario: revenue_options[property_id mod 6]',
            },
            'data_note':'Reported public annual utility observations; thermal is a whole-property fuel-use proxy. Age is building age, not equipment age. Revenue is illustrative.',
        }
        all_clean.append(building)
    # A balanced 30-building display sample, spread over an intensity composite.
    # This is deterministic demonstration sampling, not a representative survey.
    sample = []
    for building_type in TYPE_MAP.values():
        choices = [r for r in all_clean if r['building_type']==building_type]
        choices.sort(key=lambda r:(sum(r[k]/r['reference_'+k] for k in MEASURES),r['building_id']))
        if len(choices) < 5:
            raise ValueError(f'Need >=5 matched clean records for {building_type}; found {len(choices)}')
        indexes = sorted(set(round(i*(len(choices)-1)/4) for i in range(5)))
        sample.extend(choices[index] for index in indexes)
    sample.sort(key=lambda r:(list(TYPE_MAP.values()).index(r['building_type']),r['name']))
    queries = load_raw('queries.json')
    source_specs = [
        ('nyc_ll84_2023','NYC LL84 energy and water disclosure — calendar year 2023','https://data.cityofnewyork.us/Environment/5zyy-y8am','nyc_ll84_2023.json'),
        ('nyc_ll84_2022','NYC LL84 energy and water disclosure — calendar year 2022','https://data.cityofnewyork.us/Environment/5zyy-y8am','nyc_ll84_2022.json'),
        ('noaa_ghcnd_2023','NOAA GHCN-Daily Central Park — calendar year 2023','https://www.ncei.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND%3AUSW00094728/detail','noaa_central_park_2023.json'),
    ]
    sources = []
    for source_id,title,url,filename in source_specs:
        path = RAW/filename
        if path.exists(): content=path.read_bytes()
        else:
            with gzip.open(str(path)+'.gz','rb') as stream: content=stream.read()
            path=Path(str(path)+'.gz')
        sources.append({'id':source_id,'title':title,'url':url,'query_url':queries[filename],'raw_file':'data/raw/'+path.name,'sha256_uncompressed':hashlib.sha256(content).hexdigest(),'retrieved_at_utc':datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat(),'record_count':len(json.loads(content))})
    report = {
        'report_year':YEAR,'raw_current_rows':len(current_raw),'raw_prior_rows':len(prior_raw),
        'unique_current_property_ids':len(latest),'screened_current_cohort_rows':sum(map(len,cohorts.values())),
        'clean_matched_buildings':len(all_clean),'demo_buildings':len(sample),
        'demo_by_type':{kind:sum(r['building_type']==kind for r in sample) for kind in TYPE_MAP.values()},
        'matched_by_type':{kind:sum(r['building_type']==kind for r in all_clean) for kind in TYPE_MAP.values()},
        'weather':weather,'benchmark_version':benchmarks['version'],
    }
    write_json(PUBLIC/'buildings.json',sample)
    write_json(PUBLIC/'benchmarks.json',benchmarks)
    write_json(PUBLIC/'sources.json',sources)
    write_json(PUBLIC/'data-quality.json',report)
    write_json(ROOT/'data'/'clean_buildings.json',all_clean)
    flat_fields = [key for key in sample[0] if key not in ('provenance','source_ids')]
    with (PUBLIC/'buildings.csv').open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=flat_fields,extrasaction='ignore')
        writer.writeheader(); writer.writerows(sample)
    with (PUBLIC/'all-buildings.csv').open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=flat_fields,extrasaction='ignore')
        writer.writeheader(); writer.writerows(all_clean)
    with (PUBLIC/'import-template.csv').open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=flat_fields,extrasaction='ignore')
        writer.writeheader(); writer.writerow(sample[0])
    (PUBLIC/'template.csv').write_bytes((PUBLIC/'import-template.csv').read_bytes())
    database=PUBLIC/'buildings.sqlite'
    with sqlite3.connect(database) as db:
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript('DROP VIEW IF EXISTS building_risk_inputs; DROP TABLE IF EXISTS provenance; DROP TABLE IF EXISTS buildings; DROP TABLE IF EXISTS weather; DROP TABLE IF EXISTS benchmarks; DROP TABLE IF EXISTS sources;')
        db.execute('CREATE TABLE sources (source_id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, query_url TEXT NOT NULL, raw_file TEXT NOT NULL, sha256_uncompressed TEXT NOT NULL, retrieved_at_utc TEXT NOT NULL, record_count INTEGER NOT NULL)')
        for source in sources:
            db.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)',tuple(source[k] for k in ('id','title','url','query_url','raw_file','sha256_uncompressed','retrieved_at_utc','record_count')))
        db.execute('CREATE TABLE weather (weather_key TEXT PRIMARY KEY, station_id TEXT NOT NULL, report_year INTEGER NOT NULL, weather_region TEXT NOT NULL, hot_days INTEGER NOT NULL CHECK(hot_days BETWEEN 0 AND 366), freeze_days INTEGER NOT NULL CHECK(freeze_days BETWEEN 0 AND 366), mean_temperature_c REAL NOT NULL, source_id TEXT REFERENCES sources(source_id), UNIQUE(station_id,report_year))')
        db.execute('INSERT INTO weather VALUES (?,?,?,?,?,?,?,?)',tuple(weather[k] for k in ('weather_key','station_id','report_year','weather_region','hot_days','freeze_days','mean_temperature_c','source_id')))
        db.execute('CREATE TABLE benchmarks (property_type TEXT NOT NULL, report_year INTEGER NOT NULL, electricity_kwh_sqft REAL NOT NULL, water_gal_sqft REAL NOT NULL, thermal_kbtu_sqft REAL NOT NULL, peer_count INTEGER NOT NULL, version TEXT NOT NULL, PRIMARY KEY(property_type, report_year))')
        for kind,ref in benchmarks['property_types'].items():
            db.execute('INSERT INTO benchmarks VALUES (?,?,?,?,?,?,?)',(kind,YEAR,ref['electricity_kwh_sqft'],ref['water_gal_sqft'],ref['thermal_kbtu_sqft'],ref['count'],benchmarks['version']))
        fields = [key for key in flat_fields if key not in ('hot_days','freeze_days','weather_region')]
        schema=[]
        for key in fields:
            value=sample[0][key]
            datatype='INTEGER' if isinstance(value,int) else 'REAL' if isinstance(value,float) else 'TEXT'
            schema.append('"'+key+'" '+datatype+(' PRIMARY KEY' if key=='building_id' else ''))
        db.execute('CREATE TABLE buildings ('+','.join(schema)+', FOREIGN KEY(weather_key) REFERENCES weather(weather_key), FOREIGN KEY(property_type,report_year) REFERENCES benchmarks(property_type,report_year))')
        insert='INSERT INTO buildings ('+','.join('"'+key+'"' for key in fields)+') VALUES ('+','.join('?' for _ in fields)+')'
        for building in all_clean:
            db.execute(insert,tuple(building[key] for key in fields))
        db.execute('CREATE TABLE provenance (building_id TEXT NOT NULL REFERENCES buildings(building_id), field_name TEXT NOT NULL, source_id TEXT REFERENCES sources(source_id), source_record_key TEXT NOT NULL, transformation TEXT NOT NULL, PRIMARY KEY(building_id,field_name))')
        for building in all_clean:
            for field_name,source_id,record_key,transformation in (
                ('electricity_kwh_sqft','nyc_ll84_2023',building['property_id'],building['provenance']['electricity_field']+' / property_gfa_calculated_1'),
                ('water_gal_sqft','nyc_ll84_2023',building['property_id'],'water_use_all_water_sources * 1000 / property_gfa_calculated_1'),
                ('thermal_kbtu_sqft','nyc_ll84_2023',building['property_id'],'sum(reported non-electric streams) / property_gfa_calculated_1: '+','.join(building['provenance']['thermal_fields'])),
                ('electricity_change_pct','nyc_ll84_2022',building['property_id'],'100 * (2023 electricity intensity / 2022 intensity - 1); same property ID, BIN, BBL and type; area within 10%'),
                ('water_change_pct','nyc_ll84_2022',building['property_id'],'100 * (2023 water intensity / 2022 intensity - 1); same property ID, BIN, BBL and type; area within 10%'),
                ('hot_days','noaa_ghcnd_2023',weather['weather_key'],'count(TMAX >= 32 Celsius), QA-passing daily records'),
                ('freeze_days','noaa_ghcnd_2023',weather['weather_key'],'count(TMIN < 0 Celsius), QA-passing daily records'),
                ('building_age_years','nyc_ll84_2023',building['property_id'],'2023 - year_built; building-age proxy, not equipment age'),
                ('annual_revenue_usd',None,'scenario:'+building['property_id'],'illustrative revenue_options[property_id mod 6]; no actual client revenue asserted'),
            ):
                db.execute('INSERT INTO provenance VALUES (?,?,?,?,?)',(building['building_id'],field_name,source_id,record_key,transformation))
        db.execute('CREATE VIEW building_risk_inputs AS SELECT b.*, w.hot_days, w.freeze_days, w.weather_region FROM buildings b JOIN weather w USING(weather_key)')
        db.execute('PRAGMA foreign_keys=ON')
        problems=db.execute('PRAGMA foreign_key_check').fetchall()
        if problems: raise ValueError(problems)
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise ValueError('SQLite integrity failure')
    print(json.dumps(report,indent=2))

if __name__ == '__main__':
    build()
