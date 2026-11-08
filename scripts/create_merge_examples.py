"""Split the retained real 30-building demo into three genuinely fragmented inputs."""
import csv
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
rows=json.loads((root/'public/data/buildings.json').read_text(encoding='utf8'))
folder=root/'public/data/fragments'
folder.mkdir(exist_ok=True)
def save(name,fields,records):
    with (folder/name).open('w',newline='',encoding='utf8') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields,extrasaction='ignore');writer.writeheader();writer.writerows(records)
save('building-register.csv',['building_id','name','address','city','state','report_year','building_type','property_type','annual_revenue_usd','revenue_source','building_age_years','weather_key','weather_year','reference_electricity_kwh_sqft','reference_water_gal_sqft','reference_thermal_kbtu_sqft','reference_label','reference_year','reference_count','thermal_coverage'],rows)
save('utility-records.csv',['building_id','report_year','electricity_kwh_sqft','electricity_change_pct','water_gal_sqft','water_change_pct','thermal_kbtu_sqft'],rows)
save('shared-weather.csv',['weather_key','station_id','city','state','report_year','hot_days','freeze_days'],[dict(weather_key=rows[0]['weather_key'],station_id='USW00094728',city='New York City',state='NY',report_year=2023,hot_days=rows[0]['hot_days'],freeze_days=rows[0]['freeze_days'])])
save('conflicting-weather.csv',['weather_key','report_year','hot_days','test_note'],[dict(weather_key=rows[0]['weather_key'],report_year=2023,hot_days=rows[0]['hot_days']+5,test_note='INTENTIONALLY ALTERED conflict-test value. This is not a NOAA observation.')])
print('Created three source fragments and one explicitly synthetic conflict-test fixture.')
