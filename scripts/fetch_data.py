from pathlib import Path
import urllib.request, urllib.parse, json, time, gzip
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data'/'raw'
RAW.mkdir(parents=True,exist_ok=True)
FIELDS='report_year,property_id,property_name,year_ending,nyc_borough_block_and_lot,nyc_building_identification,address_1,city,postal_code,primary_property_type,largest_property_use_type,year_built,number_of_buildings,occupancy,metered_areas_energy,metered_areas_water,property_gfa_calculated_1,property_gfa_self_reported,electricity_use_grid_purchase_1,electricity_use_grid_purchase_2,water_use_all_water_sources,indoor_water_use_all_water,natural_gas_use_kbtu,district_steam_use_kbtu,district_hot_water_use_kbtu,district_chilled_water_use,fuel_oil_1_use_kbtu,fuel_oil_2_use_kbtu,fuel_oil_4_use_kbtu,fuel_oil_5_6_use_kbtu,diesel_2_use_kbtu,propane_use_kbtu,kerosene_use_kbtu,estimated_values_energy,estimated_values_water,alert_energy_meter_has_less,alert_energy_meter_has_gaps,alert_energy_meter_has,alert_water_meter_has_less,report_submission_date,borough,latitude,longitude'
def fetch(url,path):
    if path.exists() or Path(str(path)+'.gz').exists(): print('Cached',path.name,flush=True); return
    for n in range(4):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'HackUTD-Research-Prototype/1.0'})
            with urllib.request.urlopen(request,timeout=120) as res: data=res.read()
            json.loads(data)
            with gzip.open(str(path)+'.gz','wb') as stream: stream.write(data)
            print('Downloaded',path.name,len(data),'bytes',flush=True)
            return
        except Exception as exc:
            print('Retry',n+1,type(exc).__name__,str(exc),flush=True)
            if n==3: raise
            time.sleep(3)
queries={}
for year in (2023,2022):
    query={'$select':FIELDS,'$where':f'report_year={year}','$order':'property_id,report_submission_date DESC','$limit':50000}
    url='https://data.cityofnewyork.us/resource/5zyy-y8am.json?'+urllib.parse.urlencode(query)
    queries[f'nyc_ll84_{year}.json']=url
    fetch(url,RAW/f'nyc_ll84_{year}.json')
query={'dataset':'daily-summaries','dataTypes':'TMAX,TMIN','stations':'USW00094728','startDate':'2023-01-01','endDate':'2023-12-31','units':'metric','format':'json','includeAttributes':'true'}
url='https://www.ncei.noaa.gov/access/services/data/v1?'+urllib.parse.urlencode(query)
queries['noaa_central_park_2023.json']=url
fetch(url,RAW/'noaa_central_park_2023.json')
(RAW/'queries.json').write_text(json.dumps(queries,indent=2)+'\n',encoding='utf-8')
