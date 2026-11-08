import {createHash} from 'node:crypto';
import {PARAMETERS, scoreBuilding, ValidationError, MODEL_VERSION} from './risk.js';

const extras={building_id:'Building ID',property_id:'Property ID',name:'Building name',address:'Street address',city:'City',state:'State',postal_code:'Postal code',building_type:'Building type',property_type:'Property use',report_year:'Reporting year',year_built:'Year built',floor_area_sqft:'Floor area (ft²)',occupancy_pct:'Occupancy (%)',weather_key:'Weather reference key',station_id:'Weather station ID',weather_year:'Weather year',weather_region:'Weather region',mean_temperature_c:'Annual mean temperature (°C)',mean_temperature_f:'Annual mean temperature (°F)',electricity_kwh:'Annual electricity (kWh)',water_gallons:'Annual water (US gallons)',water_kgal:'Annual water (thousand US gallons)',thermal_kbtu:'Annual non-electric thermal energy (kBtu)',previous_electricity_kwh_sqft:'Previous electricity intensity (kWh/ft²)',previous_water_gal_sqft:'Previous water intensity (gal/ft²)',previous_electricity_kwh:'Previous annual electricity (kWh)',previous_water_gallons:'Previous annual water (US gallons)',previous_water_kgal:'Previous annual water (thousand US gallons)',previous_floor_area_sqft:'Previous floor area (ft²)',previous_report_year:'Previous reporting year',revenue_source:'Revenue source / scenario label',reference_electricity_kwh_sqft:'Electricity peer reference (kWh/ft²)',reference_water_gal_sqft:'Water peer reference (gal/ft²)',reference_thermal_kbtu_sqft:'Thermal peer reference (kBtu/ft²)',reference_label:'Peer reference label',reference_year:'Peer reference year',reference_count:'Peer cohort count',benchmark_version:'Benchmark version',thermal_coverage:'Thermal data coverage',electricity_coverage:'Electricity data coverage'};
export const MERGE_FIELDS=[...PARAMETERS.map(p=>({key:p.key,label:`${p.label} (${p.unit})`})),...Object.entries(extras).map(([key,label])=>({key,label}))];
const fieldSet=new Set(MERGE_FIELDS.map(f=>f.key));
const textFields=new Set(['building_id','property_id','name','address','city','state','postal_code','building_type','property_type','weather_key','station_id','weather_region','revenue_source','reference_label','benchmark_version','thermal_coverage','electricity_coverage']);
const weatherFields=['hot_days','freeze_days','weather_year','weather_region','mean_temperature_c'];
const exactNumericFields=new Set(['annual_revenue_usd','report_year','previous_report_year','year_built','building_age_years','hot_days','freeze_days','weather_year','reference_year','reference_count']);
const normalizeHeader=s=>String(s).toLowerCase().replace(/²/g,'2').replace(/[^a-z0-9]/g,'');
const aliases=new Map(MERGE_FIELDS.map(f=>[normalizeHeader(f.key),f.key]));
const addAliases=(field,list)=>list.forEach(name=>aliases.set(normalizeHeader(name),field));
addAliases('building_id',['Building ID','building identifier','asset id','asset_id','buildingid']);
addAliases('property_id',['property identifier','propertyid']);
addAliases('name',['building name','property name','asset name']);addAliases('address',['street address','address 1','street']);
addAliases('state',['state code','province']);addAliases('postal_code',['zip','zipcode','zip code']);
addAliases('building_type',['industry','industry field','building category','client industry']);addAliases('property_type',['primary property type','property use']);
addAliases('report_year',['year','calendar year','reporting year']);addAliases('annual_revenue_usd',['annual revenue','client revenue','revenue usd','annual client revenue usd']);
addAliases('year_built',['construction year','built year']);addAliases('building_age_years',['building age','age years']);
addAliases('floor_area_sqft',['gross floor area ft2','gross floor area sqft','floor area ft2','area sqft','gfa sqft']);
addAliases('electricity_kwh',['annual electricity kwh','electricity use kwh','electricity consumption kwh']);
addAliases('water_gallons',['annual water gallons','water use gallons','water gallons']);addAliases('water_kgal',['water use kgal','annual water kgal']);
addAliases('thermal_kbtu',['thermal energy kbtu','thermal use kbtu']);
addAliases('electricity_kwh_sqft',['electricity intensity','electricity intensity kwh ft2','electricity intensity kwh sqft year']);
addAliases('water_gal_sqft',['water intensity','water intensity gal ft2','water intensity gal sqft year']);
addAliases('thermal_kbtu_sqft',['thermal intensity','thermal intensity kbtu ft2']);
addAliases('electricity_change_pct',['electricity yoy pct','electricity change percent']);addAliases('water_change_pct',['water yoy pct','water change percent']);
addAliases('hot_days',['hot days','days above 32c','hot days 32c']);addAliases('freeze_days',['freezing days','cold days','days below 0c']);
addAliases('station_id',['weather station','station']);addAliases('mean_temperature_c',['mean temperature c','average temperature c']);
addAliases('previous_report_year',['prior year','previous year']);
const token=value=>typeof value==='string'||typeof value==='number'?String(value).trim().toUpperCase().replace(/\s+/g,' '):'';
const addressToken=value=>token(value).replace(/\bSTREET\b/g,'ST').replace(/\bROAD\b/g,'RD').replace(/\bAVENUE\b/g,'AVE').replace(/\bBOULEVARD\b/g,'BLVD').replace(/\bDRIVE\b/g,'DR').replace(/\./g,'').replace(/\s+/g,' ');
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,20);
const missing=value=>value===undefined||value===null||typeof value==='string'&&['','na','n/a','not available','null','unknown','-'].includes(value.trim().toLowerCase());
const same=(a,b,field)=>typeof a==='number'&&typeof b==='number'?(exactNumericFields.has(field)?a===b:Math.abs(a-b)<=1e-6+Math.max(Math.abs(a),Math.abs(b))*1e-9):field==='address'?addressToken(a)===addressToken(b):token(a)===token(b);
const location=b=>b.city&&(b.state||b.postal_code)?`${token(b.city)}|${token(b.state||b.postal_code)}`:'';
const addressKey=b=>b.address&&location(b)?`${addressToken(b.address)}|${location(b)}|${b.report_year}`:'';
const canonicalType=value=>({technology:'Technology',healthcare:'Healthcare',commercial:'Commercial',residential:'Residential',industrial:'Industrial',institutional:'Institutional'}[normalizeHeader(value)]||value);

export function describeFragment(file){
  const columns=[...new Set(file.rows.flatMap(row=>row&&typeof row==='object'&&!Array.isArray(row)?Object.keys(row):[]))];
  const mapping=Object.fromEntries(columns.map(c=>[c,aliases.get(normalizeHeader(c))||'']));
  const mapped=new Set(Object.values(mapping));
  const kind=!mapped.has('building_id')&&!mapped.has('property_id')&&!mapped.has('address')&&(['hot_days','freeze_days','mean_temperature_c','mean_temperature_f'].some(f=>mapped.has(f)))?'weather':'building';
  return {id:file.id,name:file.name,row_count:file.rows.length,columns,mapping,kind,preview:file.rows.slice(0,3),sha256:file.sha256};
}

export function mergeFragments(files,{defaultYear=2023,resolutions={},benchmarks={}}={}){
  if(!Array.isArray(files)||!files.length||files.length>10)throw new ValidationError(['Select between 1 and 10 fragmented datasets.']);
  defaultYear=Number(defaultYear);
  if(!Number.isInteger(defaultYear)||defaultYear<1900||defaultYear>2100)throw new ValidationError(['The default reporting year must be between 1900 and 2100.']);
  if(!resolutions||typeof resolutions!=='object'||Array.isArray(resolutions))throw new ValidationError(['Conflict resolutions must be an object.']);
  const warnings=[],records=[],weatherRecords=[],sources=[],conflictMap=new Map();let inputRows=0;
  for(const file of files){
    if(!Array.isArray(file.rows)||!file.rows.length||file.rows.length>5000)throw new ValidationError([`${file.name}: each file must contain 1–5,000 rows.`]);
    if(!['building','weather'].includes(file.kind))throw new ValidationError([`${file.name}: choose Building records or Shared weather.`]);
    const info=describeFragment(file),mapping=file.mapping||info.mapping;
    for(const value of Object.values(mapping))if(value&&(typeof value!=='string'||!fieldSet.has(value)))throw new ValidationError([`${file.name}: unsupported mapped field. Use the column-mapping choices provided.`]);
    const ignored=info.columns.filter(c=>!mapping[c]);if(ignored.length)warnings.push(`${file.name}: ignored unmapped columns: ${ignored.join(', ')}.`);
    sources.push({id:file.id,title:file.name,name:file.name,record_count:file.rows.length,sha256:file.sha256});inputRows+=file.rows.length;
    for(let index=0;index<file.rows.length;index++){
      const raw=file.rows[index],record={uid:`${file.id}:${index+1}`,fields:{},value:{},issues:[],source:{file_id:file.id,file:file.name,row:index+1}};
      if(!raw||typeof raw!=='object'||Array.isArray(raw)){record.issues.push('Source row must be an object.');}
      else for(const [column,value]of Object.entries(raw)){
        let field=Object.hasOwn(mapping,column)?mapping[column]:'';if(!field||missing(value))continue;
        if(typeof value==='object'||typeof value==='boolean'){record.issues.push(`${column} must contain one text or numeric value.`);continue;}
        let normalized=value,transformation='Reported value';
        if(textFields.has(field))normalized=String(value).trim();
        else{
          const text=String(value).trim().replaceAll(',','').replace(field==='annual_revenue_usd'?/^\$/g:/$^/g,'');
          normalized=Number(text);if(!Number.isFinite(normalized)){record.issues.push(`${column} is not a finite numeric value.`);continue;}
        }
        if(field==='building_type')normalized=canonicalType(normalized);
        if(field==='water_kgal'||field==='previous_water_kgal'){field=field.replace('kgal','gallons');normalized*=1000;transformation='Thousand US gallons × 1,000 → US gallons';}
        if(field==='mean_temperature_f'){field='mean_temperature_c';normalized=(normalized-32)*5/9;transformation='(°F − 32) × 5/9 → °C';}
        (record.fields[field]??=[]).push({...record.source,column,raw:value,value:normalized,transformation});
      }
      if(!record.fields.report_year)record.fields.report_year=[{...record.source,column:'(default year)',raw:null,value:defaultYear,transformation:'Explicit import default reporting year'}];
      for(const [field,values]of Object.entries(record.fields)){
        record.value[field]=values[0].value;
        if(['building_id','property_id','report_year'].includes(field)&&values.some(v=>!same(v.value,values[0].value,field)))record.issues.push(`Conflicting columns mapped to ${field}; correct the column mapping.`);
      }
      if(!Number.isInteger(record.value.report_year)||record.value.report_year<1900||record.value.report_year>2100)record.issues.push('Invalid reporting year.');
      (file.kind==='weather'?weatherRecords:records).push(record);
    }
  }
  if(!records.length)throw new ValidationError(['At least one selected file must contain building records.']);
  if(inputRows>30000)throw new ValidationError(['A merge may contain at most 30,000 source rows.']);
  const parent=records.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  const identities=new Map(),addresses=new Map();
  records.forEach((r,i)=>{
    for(const field of ['building_id','property_id'])if(token(r.value[field])){const key=`${field}|${token(r.value[field])}|${r.value.report_year}`;(identities.get(key)||identities.set(key,[]).get(key)).push(i);}
    const addr=addressKey(r.value);if(addr)(addresses.get(addr)||addresses.set(addr,[]).get(addr)).push(i);
    if(!token(r.value.building_id)&&!token(r.value.property_id)&&!addr)r.issues.push('No matching key: provide a building/property ID, or street address plus city and state/postal code.');
  });
  for(const indexes of identities.values()){
    const ids=new Set(indexes.map(i=>token(records[i].value.building_id)).filter(Boolean));
    if(ids.size>1){indexes.forEach(i=>records[i].issues.push('One property ID refers to multiple building IDs; matching is ambiguous.'));continue;}
    indexes.slice(1).forEach(i=>union(indexes[0],i));
  }
  for(const indexes of addresses.values()){
    const ids=new Set(indexes.map(i=>token(records[i].value.building_id)).filter(Boolean)),props=new Set(indexes.map(i=>token(records[i].value.property_id)).filter(Boolean));
    if(ids.size<=1&&props.size<=1)indexes.slice(1).forEach(i=>union(indexes[0],i));
    else indexes.filter(i=>!token(records[i].value.building_id)&&!token(records[i].value.property_id)).forEach(i=>records[i].issues.push('This address belongs to multiple IDs. Supply an ID to match this row safely.'));
  }
  const grouped=new Map();records.forEach((r,i)=>{const key=find(i);(grouped.get(key)||grouped.set(key,[]).get(key)).push(r);});
  if(grouped.size>5000)throw new ValidationError(['A merged portfolio may contain at most 5,000 building/year records.']);
  function resolve(scope,recordKey,label,field,observations){
    const candidates=[];
    for(const observation of observations){const existing=candidates.find(c=>same(c.value,observation.value,field));if(existing)existing.sources.push(observation);else candidates.push({value:observation.value,sources:[observation]});}
    if(candidates.length<2)return candidates[0]?.value;
    const id=digest(`${scope}|${recordKey}|${field}`),choice=resolutions[id],selected=Number.isInteger(choice)&&choice>=0&&choice<candidates.length?choice:null;
    conflictMap.set(id,{id,scope,record_key:recordKey,label,field,candidates,selected,resolved:selected!==null,affected:[]});
    return selected===null?undefined:candidates[selected].value;
  }
  function gather(rows){const fields={};for(const row of rows)for(const [key,values]of Object.entries(row.fields))(fields[key]??=[]).push(...values);return fields;}
  function weatherKey(b){
    if(b.weather_key)return /:\d{4}$/.test(b.weather_key)?token(b.weather_key):`${token(b.weather_key)}:${b.report_year}`;
    if(b.station_id)return `${token(b.station_id)}:${b.report_year}`;
    return location(b)?`LOC:${location(b)}:${b.report_year}`:'';
  }
  const wx=new Map(),wxLocations=new Map(),orphans=[];
  function addWeather(key,fields,issues=[]){
    if(!wx.has(key))wx.set(key,{fields:{},issues:[],affected:[]});const entry=wx.get(key);entry.issues.push(...issues);
    for(const field of weatherFields)if(fields[field])(entry.fields[field]??=[]).push(...fields[field]);
  }
  for(const record of weatherRecords){
    const key=weatherKey(record.value);if(!key){orphans.push({...record.source,issues:[...record.issues,'Shared weather requires a station/reference key, or city and state/postal code.']});continue;}
    if(!key.endsWith(`:${record.value.report_year}`))record.issues.push('Weather key year and reporting year disagree.');
    addWeather(key,record.fields,record.issues);
    const loc=location(record.value);if(loc){const index=`${loc}|${record.value.report_year}`;if(!wxLocations.has(index))wxLocations.set(index,new Set());wxLocations.get(index).add(key);}
  }
  const entries=[];
  for(const rows of grouped.values()){
    const mergeKey=digest(rows.map(r=>r.uid).sort().join('|')),fields=gather(rows),building={},issues=rows.flatMap(r=>r.issues);
    const label=rows.find(r=>r.value.name)?.value.name||rows.find(r=>r.value.building_id)?.value.building_id||rows[0].value.address||`Unmatched row ${rows[0].source.row}`;
    for(const [field,values]of Object.entries(fields))if(!weatherFields.includes(field)){const value=resolve('building',mergeKey,label,field,values);if(value!==undefined)building[field]=value;}
    const derived=(field,value,dependencies,description)=>{
      if(!Number.isFinite(value))return;
      const observation={file_id:'derived',file:'Calculated from merged inputs',row:null,column:dependencies.join(', '),raw:null,value,transformation:description};
      fields[field]=[...(fields[field]||[]),observation];const resolved=resolve('building',mergeKey,label,field,fields[field]);
      if(resolved===undefined)delete building[field];else building[field]=resolved;
    };
    if(building.floor_area_sqft>0){
      for(const [total,intensity]of [['electricity_kwh','electricity_kwh_sqft'],['water_gallons','water_gal_sqft'],['thermal_kbtu','thermal_kbtu_sqft']])if(typeof building[total]==='number')derived(intensity,building[total]/building.floor_area_sqft,[total,'floor_area_sqft'],'Annual total divided by floor area');
    }
    if(building.previous_floor_area_sqft>0){
      for(const [total,intensity]of [['previous_electricity_kwh','previous_electricity_kwh_sqft'],['previous_water_gallons','previous_water_gal_sqft']])if(typeof building[total]==='number')derived(intensity,building[total]/building.previous_floor_area_sqft,[total,'previous_floor_area_sqft'],'Previous annual total divided by previous floor area');
    }
    for(const [current,previous,change]of [['electricity_kwh_sqft','previous_electricity_kwh_sqft','electricity_change_pct'],['water_gal_sqft','previous_water_gal_sqft','water_change_pct']]){
      if(typeof building[previous]==='number'&&typeof building[current]==='number'){
        if(building.previous_report_year!==building.report_year-1)issues.push(`To calculate ${change}, previous_report_year must equal reporting year minus one.`);
        else if(building[previous]<=0)issues.push(`${previous} must be positive to compute a percentage change.`);
        else derived(change,100*(building[current]/building[previous]-1),[current,previous,'previous_report_year'],'100 × (current intensity / previous intensity − 1)');
      }
    }
    if(typeof building.year_built==='number'&&typeof building.report_year==='number')derived('building_age_years',building.report_year-building.year_built,['report_year','year_built'],'Reporting year minus construction year');
    if(!building.building_type&&building.property_type){const found=Object.entries(benchmarks.building_types||{}).find(([,r])=>token(r.property_type)===token(building.property_type));if(found){building.building_type=found[0];fields.building_type=[{file:'Reference property-use mapping',row:null,column:'property_type',value:found[0],transformation:'Exact known property use mapped to the supported building type'}];}}
    if(!building.building_id)building.building_id=building.property_id?`PROPERTY-${building.property_id}`:`MERGED-${mergeKey}`;
    let key=building.weather_key||building.station_id?weatherKey(building):'';
    if(!key&&location(building)){
      const possible=[...(wxLocations.get(`${location(building)}|${building.report_year}`)||[])];
      if(possible.length===1)key=possible[0];
      else if(possible.length>1)key=resolve('building',mergeKey,label,'weather_key',possible.map(value=>({value,file:'Matching shared weather sources',column:'station / location and year',row:null,transformation:'Choose the correct weather reference'})));
      else key=weatherKey(building);
    }
    if(!key&&weatherFields.some(field=>fields[field]?.length)&&![...conflictMap.values()].some(c=>c.record_key===mergeKey&&c.field==='weather_key'&&!c.resolved))key=`BUILDING:${mergeKey}:${building.report_year}`;
    if(key){
      building.weather_key=key;
      if(!key.endsWith(`:${building.report_year}`))issues.push('Weather key year and reporting year disagree.');
      addWeather(key,fields);wx.get(key).affected.push(mergeKey);
    }
    entries.push({merge_key:mergeKey,building,fields,issues,label,weatherKey:key});
  }
  const resolvedWeather=new Map();
  for(const [key,entry]of wx){
    const values={};
    for(const [field,observations]of Object.entries(entry.fields)){const value=resolve('weather',key,key,field,observations);if(value!==undefined)values[field]=value;}
    entry.representatives=Object.fromEntries(Object.entries(values).map(([field,value])=>[field,entry.fields[field].find(o=>same(o.value,value,field))]));
    entry.sourceNames=[...new Set(Object.values(entry.fields).flat().map(o=>o.file))];
    resolvedWeather.set(key,values);
    for(const c of conflictMap.values())if(c.scope==='weather'&&c.record_key===key)c.affected=[...entry.affected];
    if(!entry.affected.length)warnings.push(`Shared weather ${key} did not match any building records.`);
  }
  const results=entries.map(entry=>{
    const b=entry.building,weather=resolvedWeather.get(entry.weatherKey);
    if(weather){
      const shared=wx.get(entry.weatherKey);Object.assign(b,weather);b.weather_year??=b.report_year;entry.issues.push(...shared.issues);
      // Store shared observations once in the report, avoiding quadratic duplication across buildings.
      for(const [field,observation]of Object.entries(shared.representatives))entry.fields[field]=[...(entry.fields[field]||[]),{...observation,weather_key:entry.weatherKey,shared_reference:'weather_provenance'}];
    }
    const conflicts=[...conflictMap.values()].filter(c=>c.scope==='building'?c.record_key===entry.merge_key:c.affected.includes(entry.merge_key));
    for(const c of conflicts){if(c.scope==='building')c.affected=[entry.merge_key];if(!c.resolved)entry.issues.push(`Unresolved ${c.scope} conflict: ${c.field}.`);}
    b.source_files=[...new Set([...Object.values(entry.fields).flat().map(v=>v.file),...(wx.get(entry.weatherKey)?.sourceNames||[])].filter(v=>v!=='Calculated from merged inputs'))].join('; ');
    b.provenance={merge:entry.fields};
    const result={merge_key:entry.merge_key,building:b,conflict_ids:conflicts.map(c=>c.id)};
    try{
      if(entry.issues.length)throw new ValidationError([...new Set(entry.issues)]);
      return {...result,...scoreBuilding(b,benchmarks)};
    }catch(error){return {...result,error:error.message,issues:error.issues||[error.message]};}
  });
  const ready=results.filter(r=>r.scores),conflicts=[...conflictMap.values()];
  const weatherProvenance=Object.fromEntries([...wx].map(([key,value])=>[key,value.fields]));
  return {results,conflicts,warnings,weather_provenance:weatherProvenance,orphan_rows:orphans,sources,benchmarks,modelVersion:MODEL_VERSION,
    summary:{total:results.length,scored:ready.length,invalid:results.length-ready.length,average:ready.length?ready.reduce((n,r)=>n+r.scores.overall,0)/ready.length:null,elevated:ready.filter(r=>r.scores.overall>=50).length,cascading:ready.filter(r=>r.scores.cascadeBoost>0).length,input_rows:inputRows,source_files:files.length,unresolved_conflicts:conflicts.filter(c=>!c.resolved).length,resolved_conflicts:conflicts.filter(c=>c.resolved).length}};
}
