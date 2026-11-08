const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const textValue=v=>{if(v===null||v===undefined)return '';if(typeof v==='object'){try{return JSON.stringify(v);}catch{return '[Invalid metadata]';}}return String(v);};
const esc=v=>textValue(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=1)=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const TYPES=['Technology','Healthcare','Commercial','Residential','Industrial','Institutional'];
const COLORS={electricity:'#6b9774',plumbing:'#a9b989',hvac:'#c6b77d',revenue:'#d9dfcd'};
const PATHS={grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',sliders:'<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',building:'<path d="M4 21V5l8-2v18m0-13h7v13M2 21h20M8 7v1m0 3v1m0 3v1m7-4h1m-1 4h1"/>',network:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M6 9v6m3-9h9v9"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',alert:'<path d="m12 3 10 18H2zM12 9v5m0 3v.1"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',fan:'<circle cx="12" cy="12" r="2"/><path d="M12 10C4 0 1 12 10 12m4 0c10-8-2-11-2-2m0 4c8 10 11-2 2-2m-4 0c-10 8 2 11 2 2"/>',drop:'<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',check:'<path d="m5 12 4 4L19 6"/>'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[n]||PATHS.info}</svg>`;
const state={config:{weights:{},benchmarks:{},parameters:[]},results:[],selected:null,manual:null,manualContext:null,sort:'overall',direction:-1,sources:[],sourceMeta:null,actions:[]};
try{const a=JSON.parse(localStorage.getItem('nexus-actions')||'[]');state.actions=Array.isArray(a)?a.filter(x=>x&&typeof x.id==='string').slice(0,100):[];}catch{}
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3500);}
async function request(url,options={}){const response=await fetch(url,options);let data;try{data=await response.json();}catch{throw new Error('The server returned an unreadable response. Please try again.');}if(!response.ok){const error=new Error(data.error||data.message||'The request could not be completed.');error.issues=data.issues;throw error;}return data;}
function message(text,error=false,issues=[]){const el=$('#global-message');el.classList.toggle('hidden',!text);el.classList.toggle('error',error);el.innerHTML=text?esc(text)+(issues.length?`<ul class="import-error-list">${issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''):'';}
const scoreColor=v=>v>=75?'#bc786c':v>=50?'#bf9958':v>=25?'#a7a06a':'#6d9b6e';
function bandHTML(value){const b=['Low','Moderate','High','Critical'].includes(value)?value:'Invalid';return `<span class="band ${b.toLowerCase()}">${b==='Invalid'?'Needs data':b}</span>`;}
const resultAt=key=>key==='manual'?state.manual:state.results[Number(key)];
function setPortfolio(payload,name=null){for(const id of ['#search','#type-filter','#risk-filter'])$(id).value='';state.results=Array.isArray(payload.results)?payload.results:[];state.sources=payload.sources||state.sources;if(payload.benchmarks)state.config.benchmarks=payload.benchmarks;const ranked=state.results.map((r,i)=>({r,i})).filter(x=>x.r.scores).sort((a,b)=>b.r.scores.overall-a.r.scores.overall);state.selected=ranked.length?String(ranked[0].i):(state.results.length?'0':null);$('#dataset-label').textContent=name?`Uploaded · ${name}`:'NYC public records · 2023 reporting year';$('#sidebar-count').textContent=state.results.length;renderStats();renderTable();renderDetail();updatePeers();const invalid=state.results.filter(x=>!x.scores);if(invalid.length)message(`${invalid.length} of ${state.results.length} rows need data before they can be scored. Every row remains visible.`,true,invalid.slice(0,10).map(x=>`Row ${x.row??state.results.indexOf(x)+1}: ${x.error||(x.issues||[]).join('; ')}`));else message(name?`${state.results.length} buildings imported and assessed. Select a building to explore its calculations.`:'');}
function renderStats(){const valid=state.results.filter(x=>x.scores),avg=valid.length?valid.reduce((a,r)=>a+r.scores.overall,0)/valid.length:null;$('#stat-count').textContent=valid.length.toLocaleString();$('#stat-count-note').textContent=valid.length===state.results.length?`${new Set(valid.map(r=>r.building.building_type)).size} building types · one shared model`:`${state.results.length-valid.length} additional rows need data`;$('#stat-average').textContent=fmt(avg);$('#stat-high').textContent=valid.filter(r=>r.scores.overall>=50).length;$('#stat-cascade').textContent=valid.filter(r=>r.scores.cascadeBoost>0).length;$('#stat-average-note').textContent='Unweighted mean of building priority indices';}
function filteredRows(){const q=$('#search').value.trim().toLowerCase(),type=$('#type-filter').value,risk=$('#risk-filter').value;return state.results.map((row,index)=>({row,key:String(index)})).filter(({row})=>{const b=row.building||{},band=row.scores?.band||'Invalid';return(!q||[b.name,b.address,b.city,b.building_id,b.property_type].some(v=>textValue(v).toLowerCase().includes(q)))&&(!type||b.building_type===type)&&(!risk||band===risk);}).sort((a,b)=>state.sort==='name'?textValue(a.row.building?.name).localeCompare(textValue(b.row.building?.name))*state.direction:((a.row.scores?.overall??-1)-(b.row.scores?.overall??-1))*state.direction);}
function renderTable(){const rows=filteredRows();$('#table-count').textContent=state.results.length;$('#table-footer-text').textContent=`Showing ${rows.length} of ${state.results.length} buildings`;$('#building-rows').innerHTML=rows.length?rows.map(({row,key})=>{const b=row.building||{},s=row.scores;return `<tr data-id="${key}" class="${state.selected===key?'selected':''}" tabindex="0" aria-label="View ${esc(b.name||`building ${key}`)}"><td><div class="building-cell"><span class="building-avatar">${icon('building')}</span><div><span class="building-name" title="${esc(b.name)}">${esc(b.name||`Building ${b.building_id||Number(key)+1}`)}</span><span class="building-address" title="${esc(b.address)}">${esc(b.address||b.city||'Address not supplied')}</span></div></div></td><td><span class="type-label">${esc(b.building_type||'Unspecified')}</span></td><td><span class="score-inline" style="--score-color:${scoreColor(s?.overall||0)}">${s?fmt(s.overall):'—'}${s?`<span class="mini-track"><span style="width:${Math.min(100,Math.max(0,s.overall))}%"></span></span>`:''}</span></td><td>${bandHTML(s?.band)}</td><td class="systems-cell">${s?`<div class="systems-mini" aria-label="Electricity ${fmt(s.electricity)}, plumbing ${fmt(s.plumbing)}, HVAC ${fmt(s.hvac)}">${['electricity','plumbing','hvac'].map(k=>`<span title="${k}: ${fmt(s[k])}">${fmt(s[k],0)}</span>`).join('')}</div>`:'—'}</td><td class="row-arrow">›</td></tr>`;}).join(''):'<tr><td colspan="6" class="empty-state">No buildings match these filters. Try a different search.</td></tr>';}
function evidenceText(b,s){const r=s?.reference||{};return[`Building ID: ${b.building_id||'Manual scenario'}`,`Property use: ${b.property_type||b.building_type}`,`Reporting year: ${b.report_year||'Not supplied'}`,`Weather: ${b.weather_key||'User-supplied scenario'}`,`Revenue: ${b.revenue_source||'user scenario'} · $${fmt(b.annual_revenue_usd,0)} / year`,`Reference: ${r.label||b.reference_label||b.building_type}${r.count?` · n=${r.count}`:''}`,`Electricity reference: ${fmt(r.electricity_kwh_sqft)} kWh/ft²/year`,`Water reference: ${fmt(r.water_gal_sqft)} gal/ft²/year`,`Thermal reference: ${fmt(r.thermal_kbtu_sqft)} kBtu/ft²/year`,b.provenance?`Record provenance:\n${typeof b.provenance==='object'?JSON.stringify(b.provenance,null,2):b.provenance}`:'',`Model: ${s?.modelVersion||state.config.modelVersion}`].filter(Boolean).join('\n');}
function detailHTML(result,key){const b=result?.building||{},s=result?.scores;if(!s)return `<div class="detail-header"><div class="detail-kicker">BUILDING REVIEW ${bandHTML('Invalid')}</div><h2>${esc(b.name||'Incomplete building record')}</h2><p class="detail-location">${icon('pin')}${esc(b.address||b.city||'No address supplied')}</p></div><div class="detail-section"><h3>This record needs attention</h3><p class="detail-warning">${esc(result?.error||'Required parameters are missing.')}</p><ul>${(result?.issues||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="detail-warning">Missing data is not scored as zero. Correct this row in your source file and upload it again.</p></div><div class="detail-section"><details class="record-evidence"><summary>View supplied record</summary><pre>${esc(JSON.stringify(b,null,2))}</pre></details></div>`;
const w=s.weights||state.config.weights[b.building_type]||{},c=s.contributions||{},keys=['electricity','plumbing','hvac','revenue'],drivers=(s.drivers||[]).filter(d=>d.points>0).slice(0,key==='manual'?5:3);
return `<div class="detail-header"><div class="detail-kicker">${key==='manual'?'SCENARIO ASSESSMENT':'BUILDING IN FOCUS'}<span>${esc(b.building_id?`#${b.building_id}`:'MANUAL INPUT')}</span></div><h2>${esc(b.name||'Untitled building')}</h2><p class="detail-location">${icon('pin')}${esc(b.address||b.city||'User-supplied scenario')}</p><div class="detail-type"><span>${esc(b.building_type)}</span><span>${esc(b.report_year||'Annual assessment')}</span></div></div>
<div class="risk-overview"><div class="risk-gauge" role="img" aria-label="Building risk ${fmt(s.overall)} out of 100" style="--score:${Math.min(100,Math.max(0,s.overall))};--score-color:${scoreColor(s.overall)}"><div class="gauge-inner"><strong>${fmt(s.overall)}</strong><small>OUT OF 100</small></div></div><div class="risk-overview-text"><span>Building priority index</span>${bandHTML(s.band)}<p>Combined system exposure.<br>Not a failure probability.</p></div></div>
<div class="system-grid">${keys.map(k=>`<div class="system-score"><span>${k==='hvac'?'HVAC':k[0].toUpperCase()+k.slice(1)}</span><strong style="color:${scoreColor(s[k])}">${fmt(s[k])}</strong><small>${fmt(Number(w[k]||0)*(Number(w[k]||0)<=1?100:1),0)}% weight</small></div>`).join('')}</div>
<div class="detail-section"><h3>What makes up the score <span>POINTS / 100</span></h3><div class="contribution-bar" aria-label="Weighted contribution by subclass">${keys.map(k=>`<span style="width:${Math.max(0,Number(c[k]||0))}%;background:${COLORS[k]}" title="${k}: ${fmt(c[k])} points"></span>`).join('')}</div><div class="contribution-legend">${keys.map(k=>`<span><i class="legend-dot" style="background:${COLORS[k]}"></i>${k==='hvac'?'HVAC':k[0].toUpperCase()+k.slice(1)} ${fmt(c[k])}</span>`).join('')}</div></div>
<div class="detail-section"><h3>System dependency <span>ONE DIRECTION</span></h3><div class="dependency-flow"><div class="flow-node">${icon('bolt')} Electricity ${fmt(s.electricity,0)}</div><span class="flow-arrow">→</span><div class="flow-node">${icon('fan')} HVAC ${fmt(s.hvac,0)}</div></div><div class="flow-boost">Base HVAC ${fmt(s.hvacBase)} <strong>+ ${fmt(s.cascadeBoost)} cascade points</strong> = ${fmt(s.hvac)}<br>Electrical scores above 50 can raise HVAC priority.</div><div class="plumbing-independent">${icon('drop')} Plumbing is independent of both systems.</div></div>
<div class="detail-section drivers-section"><h3>Leading risk drivers <span>INVESTIGATE & VERIFY</span></h3>${drivers.length?drivers.map(d=>`<div class="driver"><div class="driver-title">${icon('alert')}<span>${esc(d.label)} <span class="subtle">· ${fmt(d.points)} pts</span></span></div><p>${esc(d.message)}</p><button class="text-button" data-action="add-investigation" data-result="${key}" data-driver="${s.drivers.indexOf(d)}">Add investigation <span>↗</span></button></div>`).join(''):'<p class="flow-boost">No parameters add priority points. This does not establish equipment condition.</p>'}<div class="detail-actions"><button class="button secondary" data-action="mitigate" data-result="${key}">${icon('sliders')} Test a power scenario</button>${key!=='manual'?`<button class="button secondary" data-action="load-manual" data-result="${key}">Edit assessment →</button>`:''}</div></div>
<div class="detail-section"><details class="record-evidence"><summary>Source record & reference evidence</summary><pre>${esc(evidenceText(b,s))}</pre></details><details class="record-evidence" style="margin-top:9px"><summary>Interpretation & data limitations</summary>${(s.warnings||[]).map(x=>`<p class="detail-warning">${esc(typeof x==='string'?x:JSON.stringify(x))}</p>`).join('')}</details></div>`;}
function renderDetail(){const row=state.selected===null?null:resultAt(state.selected);if(row)$('#building-detail').innerHTML=detailHTML(row,state.selected);}
function saveActions(){try{localStorage.setItem('nexus-actions',JSON.stringify(state.actions));}catch{toast('Actions are kept for this session; browser storage is unavailable.');}renderActions();}
function renderActions(){$('#action-count').textContent=state.actions.filter(x=>!x.done).length;$('#action-list').innerHTML=state.actions.length?state.actions.map(a=>`<div class="action-item ${a.done?'done':''}"><button class="action-check" data-action="toggle-action" data-action-id="${esc(a.id)}" aria-label="${a.done?'Mark planned':'Mark completed'}: ${esc(a.title)}">${a.done?icon('check'):''}</button><div class="action-item-text"><strong>${esc(a.title)}</strong><p>${esc(a.building)} · ${esc(a.system)} · ${esc(a.detail)}</p></div><span class="action-status">${a.done?'Completed':'Planned'}</span><button class="icon-button" data-action="remove-action" data-action-id="${esc(a.id)}" aria-label="Remove investigation">${icon('close')}</button></div>`).join(''):'<div class="queue-empty">Select a building and add an investigation to start your action plan.</div>';}
function addInvestigation(key,index){const row=resultAt(key),d=row?.scores?.drivers?.[index];if(!d)return;const b=row.building,identity=`${b.building_id||b.name}|${d.parameter}`;if(state.actions.some(x=>x.identity===identity&&!x.done)){toast('This investigation is already planned.');return;}state.actions.unshift({id:crypto.randomUUID(),identity,building:b.name||b.building_id||'Scenario building',system:d.system,title:d.label,detail:d.action||d.message,done:false,created:new Date().toISOString()});state.actions=state.actions.slice(0,100);saveActions();toast('Investigation added to your local action plan.');}
function tabTo(name){$$('[data-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.tab===name);if(el.dataset.tab===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('#portfolio-view').classList.toggle('hidden',name!=='portfolio');$('#assessment-view').classList.toggle('hidden',name!=='assessment');$('#breadcrumb-label').textContent=name==='portfolio'?'Portfolio overview':'Building assessment';}
const FALLBACK_FIELDS=[{key:'electricity_kwh_sqft',label:'Electricity intensity',unit:'kWh / ft² / year',min:0,step:.01,default:35,group:'Electricity'},{key:'electricity_change_pct',label:'Electricity intensity change',unit:'% year over year',min:-100,step:.01,default:25,group:'Electricity'},{key:'water_gal_sqft',label:'Water intensity',unit:'gal / ft² / year',min:0,step:.01,default:65,group:'Plumbing'},{key:'water_change_pct',label:'Water intensity change',unit:'% year over year',min:-100,step:.01,default:20,group:'Plumbing'},{key:'thermal_kbtu_sqft',label:'Thermal energy intensity',unit:'kBtu / ft² / year',min:0,step:.01,default:65,group:'HVAC'},{key:'building_age_years',label:'Building age',unit:'years at reporting year',min:0,step:1,default:60,group:'HVAC'},{key:'hot_days',label:'Hot days',unit:'maximum ≥ 32°C',min:0,max:366,step:1,default:30,group:'HVAC'},{key:'freeze_days',label:'Freezing days',unit:'minimum < 0°C',min:0,max:366,step:1,default:60,group:'HVAC'}];
function manualParameters() {
  const configured=state.config.parameters||[];
  const maximums={electricity_kwh_sqft:100000,building_age_years:500,hot_days:366,freeze_days:366};
  return FALLBACK_FIELDS.map(field=>({max:maximums[field.key]??1000000,...field,...configured.find(p=>p.key===field.key)}));
}
function buildManual() {
  const form=$('#assessment-form');
  form.noValidate=true;
  $('#manual-type').innerHTML=TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
  $('#type-filter').innerHTML='<option value="">All building types</option>'+TYPES.map(t=>`<option>${t}</option>`).join('');
  $('#manual-fields').innerHTML=['Electricity','Plumbing','HVAC'].map((group,index)=>`<div class="form-section"><div class="form-section-heading"><span class="section-number">0${index+2}</span><div><h3>${group==='HVAC'?'HVAC & climate':group}</h3><p>${group==='Electricity'?'Understand the load and how it is changing.':group==='Plumbing'?'Assess water demand independently.':'Connect thermal demand, climate and building vintage.'}</p></div></div><div class="form-grid">${manualParameters().filter(f=>f.group===group).map(f=>`<label class="field"><span>${esc(f.label)}<small>${esc(f.unit)}</small></span><input id="manual-${f.key}" type="number" name="${f.key}" min="${f.min??0}" max="${f.max??1000000}" step="${f.step===1?'1':'any'}" value="${f.default??0}" aria-describedby="help-${f.key}" required><small id="help-${f.key}">${esc(f.help||'')}</small></label>`).join('')}</div></div>`).join('');
  for(const name of ['name','report_year','annual_revenue_usd']) form.elements.namedItem(name).id=`manual-${name}`;
  form.elements.namedItem('annual_revenue_usd').step='any';
  updatePeers(false);
  updateWeatherLimits();
}
function refreshManualConfiguration() {
  const form=$('#assessment-form');
  for(const field of manualParameters()){
    const input=form.elements.namedItem(field.key);if(!input)continue;
    input.min=String(field.min);input.max=String(field.max);input.step=field.step===1?'1':'any';
    $(`#help-${field.key}`).textContent=field.help||'';
  }
  updateWeatherLimits();updatePeers();
}
const peerMap=()=>state.config.benchmarks?.property_types||state.config.benchmarks?.byPropertyType||{};
const typeMap=()=>state.config.benchmarks?.building_types||state.config.benchmarks?.byBuildingType||{};
function usesImportedReference() {
  const c=state.manualContext,type=$('#manual-type').value,peer=$('#manual-peer').value;
  return c&&c.building_type===type&&(!peer||c.property_type===peer)&&['electricity_kwh_sqft','water_gal_sqft','thermal_kbtu_sqft'].every(k=>Number(c[`reference_${k}`])>0);
}
function updatePeers(preserve=true) {
  const select=$('#manual-peer'),selected=preserve?select.value:'',type=$('#manual-type').value;
  const recordedUses=state.results.filter(row=>row.building?.building_type===type).map(row=>row.building.property_type);
  const peers=Object.entries(peerMap()).filter(([name,r])=>r.building_type===type||recordedUses.includes(name)||typeMap()[type]?.property_type===name).map(([name])=>name);
  const imported=state.manualContext;
  if(imported?.building_type===type&&imported.property_type&&usesImportedReference()&&!peers.includes(imported.property_type))peers.push(imported.property_type);
  select.innerHTML='<option value="">Building-type reference</option>'+peers.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if(peers.includes(selected))select.value=selected;
  updatePeerHelp();
}
function updatePeerHelp() {
  const type=$('#manual-type').value,peer=$('#manual-peer').value,c=state.manualContext;
  let reference=peer?peerMap()[peer]:typeMap()[type],label=peer||type;
  if(usesImportedReference()){
    reference={electricity_kwh_sqft:c.reference_electricity_kwh_sqft,water_gal_sqft:c.reference_water_gal_sqft,thermal_kbtu_sqft:c.reference_thermal_kbtu_sqft,count:c.reference_count||c.peer_count};
    label=c.reference_label||'Imported comparison';
  }
  $('#peer-help').textContent=reference?`${label}: electricity ${fmt(reference.electricity_kwh_sqft)} kWh/ft² · water ${fmt(reference.water_gal_sqft)} gal/ft² · thermal ${fmt(reference.thermal_kbtu_sqft)} kBtu/ft²${reference.count?` · ${reference.count} records`:''}`:'The scoring engine will resolve the reference for the selected building type.';
}
function updateWeatherLimits() {
  const year=Number($('#assessment-form').elements.namedItem('report_year').value);
  const limit=year%4===0&&(year%100!==0||year%400===0)?366:365;
  for(const key of ['hot_days','freeze_days'])$('#assessment-form').elements.namedItem(key).max=String(limit);
}
function manualValues() {
  const form=$('#assessment-form'),raw=Object.fromEntries(new FormData(form)),fields=[];
  const value={name:(raw.name||'').trim(),building_type:raw.building_type,revenue_source:'scenario',building_id:'MANUAL'};
  if(!value.name)fields.push({key:'name',message:'Enter a building name.'});
  if(!TYPES.includes(value.building_type))fields.push({key:'building_type',message:'Choose a building type.'});
  const specs=[{key:'report_year',label:'Reporting year',min:1900,max:2100,step:1},{key:'annual_revenue_usd',label:'Annual client revenue',min:0,max:1e15},...manualParameters()];
  for(const field of specs){
    const text=raw[field.key]?.trim()??'',number=Number(text);
    if(text===''){fields.push({key:field.key,message:`${field.label} is required.`});continue;}
    if(!Number.isFinite(number)||number<field.min||number>(field.max??1000000)){
      fields.push({key:field.key,message:`${field.label} must be between ${field.min} and ${field.max??1000000}.`});continue;
    }
    if(field.step===1&&!Number.isInteger(number)){fields.push({key:field.key,message:`${field.label} must be a whole number.`});continue;}
    value[field.key]=number;
  }
  if(Number.isInteger(value.report_year)){
    const year=value.report_year,days=year%4===0&&(year%100!==0||year%400===0)?366:365;
    for(const key of ['hot_days','freeze_days'])if(value[key]>days)fields.push({key,message:`${key==='hot_days'?'Hot days':'Freezing days'} cannot exceed ${days} in ${year}.`});
  }
  if(fields.length){const error=new Error(fields.map(f=>f.message).join(' '));error.fields=fields;error.issues=fields.map(f=>f.message);throw error;}
  if(raw.property_type)value.property_type=raw.property_type;
  if(usesImportedReference())for(const [key,input]of Object.entries(state.manualContext))if(key.startsWith('reference_')||key==='peer_count'||key==='benchmark_version')value[key]=input;
  return value;
}
function clearManualErrors() {
  const form=$('#assessment-form'),error=$('#manual-error');
  error.classList.add('hidden');error.replaceChildren();
  $$('[aria-invalid]',form).forEach(input=>{input.removeAttribute('aria-invalid');input.removeAttribute('aria-errormessage');});
  $$('.field-error',form).forEach(el=>el.remove());
}
function showManualError(error) {
  const form=$('#assessment-form'),summary=$('#manual-error');
  const specs=[{key:'name',label:'Building name'},{key:'building_type',label:'Building type'},{key:'report_year',label:'Reporting year'},{key:'annual_revenue_usd',label:'Annual client revenue'},...manualParameters()];
  const errors=error.fields||((error.issues?.length?error.issues:[error.message]).map(message=>{
    const field=specs.find(p=>message.includes(p.key));
    return {key:field?.key,message:field?message.replaceAll(field.key,field.label):message};
  }));
  for(const item of errors){
    const input=item.key&&form.elements.namedItem(item.key);
    if(!input||input.getAttribute('aria-invalid'))continue;
    const note=document.createElement('small');note.id=`error-${item.key}`;note.className='field-error';note.textContent=item.message;
    input.setAttribute('aria-invalid','true');input.setAttribute('aria-errormessage',note.id);input.closest('.field')?.append(note);
  }
  summary.innerHTML='<strong>Assessment could not be completed</strong><ul>'+errors.map(item=>`<li>${esc(item.message)}</li>`).join('')+'</ul>';
  summary.classList.remove('hidden');summary.focus();summary.scrollIntoView?.({block:'center',behavior:'auto'});
}
function manualPlaceholder(title,message,status='empty') {
  const result=$('#manual-result');result.dataset.status=status;
  result.innerHTML=`<section class="panel result-placeholder"><div class="manual-status-icon">${status==='loading'?'<span class="spinner"></span>':icon('building')}</div><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="placeholder-systems"><span>Electricity</span><span>Plumbing</span><span>HVAC</span><span>Revenue</span></div></section>`;
}
function setManualBusy(busy) {
  const button=$('#assess-button');button.disabled=busy;button.setAttribute('aria-busy',String(busy));
  button.innerHTML=busy?'<span class="spinner"></span> Calculating assessment…':`${icon('activity')} Calculate building risk <span>→</span>`;
}
function cancelManualCalculation() {
  state.manualRun=(state.manualRun||0)+1;state.manualController?.abort();state.manualController=null;setManualBusy(false);
}
function markManualDirty() {
  cancelManualCalculation();state.manual=null;
  manualPlaceholder('Ready to recalculate.','Inputs changed. Calculate again to see the scores for these values.','dirty');
}
async function assessManual(event) {
  event.preventDefault();cancelManualCalculation();clearManualErrors();state.manual=null;
  let building;
  try{building=manualValues();}catch(error){manualPlaceholder('Check the highlighted inputs.','Your entries are preserved. Correct the fields and calculate again.','error');showManualError(error);return;}
  const run=state.manualRun,controller=new AbortController();state.manualController=controller;
  const timeout=setTimeout(()=>controller.abort(),15000);
  setManualBusy(true);manualPlaceholder('Calculating your assessment…','Evaluating each system, its dependencies and your building-type weights.','loading');
  try{
    const result=await request('/api/score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(building),signal:controller.signal});
    if(run!==state.manualRun)return;
    if(!result.building||!result.scores||!['electricity','plumbing','hvac','revenue','overall'].every(key=>Number.isFinite(result.scores[key])))throw new Error('The assessment response was incomplete. Please calculate again.');
    state.manual=result;const target=$('#manual-result');target.dataset.status='complete';
    target.innerHTML=`<section class="panel">${detailHTML(result,'manual')}</section>`;
    target.focus({preventScroll:true});target.scrollIntoView?.({behavior:'auto',block:'start'});
  }catch(error){
    if(run!==state.manualRun)return;
    if(controller.signal.aborted)error=new Error('The calculation timed out. Check that the local app is running and try again.');
    else if(error instanceof TypeError)error=new Error('Could not reach the local app. Keep the app server running, then try again.');
    manualPlaceholder('Assessment needs another try.','Your inputs have been kept. Review the message and calculate again.','error');showManualError(error);
  }finally{
    clearTimeout(timeout);
    if(run===state.manualRun){state.manualController=null;setManualBusy(false);}
  }
}
function loadManual(key) {
  const row=resultAt(key);if(!row?.building||!row.scores)return;
  cancelManualCalculation();clearManualErrors();const building=row.building,form=$('#assessment-form');
  state.manualContext={...building};form.elements.namedItem('building_type').value=building.building_type;
  // Rebuild compatible peers before assigning the imported property use.
  $('#manual-peer').value='';updatePeers(false);
  for(const field of ['name','report_year','annual_revenue_usd',...manualParameters().map(p=>p.key)]){
    const input=form.elements.namedItem(field);if(input&&building[field]!==undefined)input.value=String(building[field]);
  }
  if(building.property_type&&[...$('#manual-peer').options].some(o=>o.value===building.property_type))$('#manual-peer').value=building.property_type;
  updateWeatherLimits();updatePeerHelp();state.manual=row;$('#manual-result').dataset.status='complete';
  $('#manual-result').innerHTML=`<section class="panel">${detailHTML(row,'manual')}</section>`;
  tabTo('assessment');toast('Building inputs and comparison references copied into the assessment.');
}
function resetManual() {
  cancelManualCalculation();$('#assessment-form').reset();state.manualContext=null;state.manual=null;
  clearManualErrors();updatePeers(false);updateWeatherLimits();
  manualPlaceholder('Bring your building into focus.','Enter your building parameters, then calculate its system and overall priority scores.');
  toast('Example parameters restored.');
}
function bindManualEvents() {
  const form=$('#assessment-form');form.addEventListener('submit',assessManual);
  form.addEventListener('input',event=>{if(event.target.name==='report_year')updateWeatherLimits();markManualDirty();});
  form.addEventListener('change',event=>{
    if(event.target.id==='manual-type'){state.manualContext=null;updatePeers(false);}
    else if(event.target.id==='manual-peer'){state.manualContext=null;updatePeerHelp();}
    markManualDirty();
  });
  $('#reset-manual').addEventListener('click',resetManual);
}

function showDialog(title,html,eyebrow='BEHIND THE NUMBERS'){$('#dialog-title').textContent=title;$('#dialog-eyebrow').textContent=eyebrow;$('#dialog-content').innerHTML=html;if(!$('#info-dialog').open)$('#info-dialog').showModal();}
function methodology(){showDialog('A model you can follow.',`<p>Nexus produces a <strong>0–100 investigation-priority index</strong> from annual utility records, regional weather and business impact. It is a transparent hackathon screening model, not a calibrated probability of failure.</p><h3>Normalize each input</h3><p>A ramp <strong>r(x,a,b) = clamp((x−a)/(b−a),0,1)</strong> maps a value to 0–1. Electricity, water and thermal intensities are compared with a median for matching property use.</p><div class="formula">E = 75r(electricity/peer,0.8,2) + 25r(electricity change %,0,50)\nP = 75r(water/peer,0.8,2) + 25r(water change %,0,50)\nH₀ = 65r(thermal/peer,0.8,2)\n   + 10min(hot days/60,1) + 10min(freezing days/120,1)\n   + 15r(building age,20,100)\nH = H₀ + (100−H₀) × 0.35 × r(E,50,100)\nR = 100 × revenue / (revenue + $100,000,000)</div><h3>One-way dependency</h3><p>Electricity above 50 increases HVAC priority by up to 35% of its remaining headroom. HVAC never changes electricity. Plumbing is independent. Revenue measures business exposure and increases monotonically.</p><h3>Your exact building-type weights</h3><table><thead><tr><th>Building type</th><th>Electricity</th><th>Plumbing</th><th>HVAC</th><th>Revenue</th></tr></thead><tbody>${TYPES.map(t=>`<tr><td>${t}</td>${['electricity','plumbing','hvac','revenue'].map(k=>`<td>${fmt((state.config.weights[t]?.[k]||0)*100,0)}%</td>`).join('')}</tr>`).join('')}</tbody></table><p style="margin-top:12px">Overall = w<sub>E</sub>E + w<sub>P</sub>P + w<sub>H</sub>H + w<sub>R</sub>R. Calculations retain full precision; displays round to one decimal. Bands: low &lt;25, moderate 25–&lt;50, high 50–&lt;75, critical ≥75.</p><h3>Interpret with context</h3><p>Coefficients, thresholds and bands are prototype policy choices. High utility use does not prove a fault or leak. Thermal energy may include cooking or process loads. Zero non-electric thermal use cannot establish all-electric HVAC health. Building vintage is not equipment age.</p><p><a href="/docs/METHODOLOGY.md" target="_blank" rel="noopener">Full methodology and worked examples ↗</a></p>`);}
function safeURL(v){try{const u=new URL(v);return['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function sourceCards(meta){let sources=meta?.sources||meta||state.sources;if(sources&&!Array.isArray(sources)&&typeof sources==='object')sources=Object.entries(sources).filter(([,v])=>v&&typeof v==='object').map(([name,v])=>({name,...v}));if(!Array.isArray(sources))sources=[];return sources.map(s=>{if(typeof s==='string')return `<div class="source-card"><p>${esc(s)}</p></div>`;const url=safeURL(s.url||s.dataset_url||s.source_url);return `<div class="source-card"><h4>${esc(s.title||s.name||s.id||'Public source')}</h4>${s.description||s.role?`<p>${esc(s.description||s.role)}</p>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener">View original source ↗</a>`:''}${s.retrieved_at_utc||s.retrieved_at?`<p>Retrieved ${esc(s.retrieved_at_utc||s.retrieved_at)}</p>`:''}${s.record_count?`<p>${fmt(s.record_count,0)} source records</p>`:''}</div>`;}).join('')||'<p>Source citations are included in the downloadable documentation.</p>';}
async function sourcesDialog(){showDialog('From fragments to one view.',`<p>Annual building consumption, property metadata and regional weather are joined by stable building identity and a shared station-year key. This is a historical demonstration with explicitly labeled revenue scenarios.</p><div id="source-cards">${sourceCards(state.sourceMeta||state.sources)}</div><h3>Download the connected database</h3><div class="download-grid"><a class="button secondary" href="/data/buildings.csv" download>${icon('download')} Demo CSV</a><a class="button secondary" href="/data/all-buildings.csv" download>${icon('download')} Full portfolio CSV</a><a class="button secondary" href="/data/buildings.sqlite" download>${icon('download')} SQLite database</a><a class="button secondary" href="/data/template.csv" download>${icon('download')} Import template</a></div><p>Upload CSV, JSON or SQLite (up to 10 MiB and 5,000 rows). Use the sample column names. SQLite must contain a <strong>buildings</strong> table. Incomplete or conflicting records remain visible and unscored.</p><h3>Check every assumption</h3><p>Each building exposes its source identity, year, weather key, reference cohort and revenue scenario. Annual consumption is a screening signal. Maintenance logs and sensor data are needed to establish actual equipment condition.</p><p><a href="/docs/DATA_SOURCES.md" target="_blank" rel="noopener">Full source citations, joins and reproduction notes ↗</a></p>`,'TRACEABLE DATA LINEAGE');try{state.sourceMeta=await request('/api/sources');if($('#source-cards'))$('#source-cards').innerHTML=sourceCards(state.sourceMeta);}catch{}}
function mitigateDialog(key){const r=resultAt(key);if(!r?.scores)return;showDialog('Trace a power intervention.',`<p>Test how an electrical change flows through the same scoring model. This is a sensitivity analysis, not evidence of a repair or a forecast of outage savings.</p><form id="mitigation-form" class="mitigation-form" data-result="${key}"><label class="field"><span>Scenario electricity intensity <small>kWh / ft² / year</small></span><input name="electricity_kwh_sqft" type="number" min="0" max="100000" step="any" value="${esc(Number((r.building.electricity_kwh_sqft*.8).toFixed(4)))}" required></label><label class="field"><span>Scenario annual intensity change <small>% year over year</small></span><input name="electricity_change_pct" type="number" min="-100" max="1000000" step="any" value="0" required></label><p style="margin-top:12px">Reconcile this annual change with your actual prior-year baseline before interpreting a real intervention.</p><button class="button primary" type="submit">Calculate model impact →</button></form><div id="mitigation-output"></div>`,'FOLLOW THE DEPENDENCY');}
async function evaluateMitigation(e){e.preventDefault();const form=e.target,row=resultAt(form.dataset.result),btn=$('button',form);if(!row)return;btn.disabled=true;try{const v=Object.fromEntries(new FormData(form)),b={...row.building,electricity_kwh_sqft:Number(v.electricity_kwh_sqft),electricity_change_pct:Number(v.electricity_change_pct)};const scenario=await request('/api/score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const a=row.scores,c=scenario.scores;$('#mitigation-output').innerHTML=`<div class="mitigation-result"><strong>Same building. Different electrical scenario.</strong><div class="mitigation-numbers"><span>Electricity<strong>${fmt(a.electricity)} → ${fmt(c.electricity)}</strong></span><span>HVAC<strong>${fmt(a.hvac)} → ${fmt(c.hvac)}</strong></span><span>Building<strong>${fmt(a.overall)} → ${fmt(c.overall)}</strong></span></div><p>Building change: <strong>${c.overall-a.overall>0?'+':''}${fmt(c.overall-a.overall)} points</strong>. Plumbing remains ${fmt(c.plumbing)} and revenue remains ${fmt(c.revenue)}. HVAC cascade changes from ${fmt(a.cascadeBoost)} to ${fmt(c.cascadeBoost)}.</p><p>All other inputs and the reference cohort were held constant.</p></div>`;}catch(error){$('#mitigation-output').innerHTML=`<div class="notice error" style="margin-top:15px">${esc(error.message)}</div>`;}finally{btn.disabled=false;}}
function csvCell(v){let s=textValue(v);if(typeof v!=='number'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function exportScores(){if(!state.results.length){toast('Load a portfolio first.');return;}const cols=['building_id','name','address','building_type','report_year','electricity_score','plumbing_score','hvac_base_score','hvac_cascade_points','hvac_score','revenue_score','building_score','priority','status','error'];const csv=[cols,...state.results.map(({building,scores:s,error})=>{const b=building||{};return[b.building_id,b.name,b.address,b.building_type,b.report_year,s?.electricity,s?.plumbing,s?.hvacBase,s?.cascadeBoost,s?.hvac,s?.revenue,s?.overall,s?.band,s?'Scored':'Needs data',error||''];})].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='nexus-portfolio-scores.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('All portfolio rows exported, including unscored records.');}
async function uploadFile(file){if(!file)return;if(file.size>10*1024*1024){message('This file exceeds 10 MiB. Use a smaller CSV, JSON or SQLite database.',true);return;}$('#upload-button').disabled=true;message(`Reading ${file.name} and validating parameters…`);try{setPortfolio(await request(`/api/import?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file}),file.name);toast('Database imported. All records are visible.');}catch(error){message(error.message,true,error.issues||[]);}finally{$('#upload-button').disabled=false;$('#file-input').value='';}}
async function loadPortfolio(){$('#reload-button').disabled=true;try{setPortfolio(await request('/api/portfolio'));}catch(error){message(error.message,true);$('#building-rows').innerHTML='<tr><td colspan="6" class="empty-state">The sample portfolio could not load. Upload a database or reload to try again.</td></tr>';$('#table-footer-text').textContent='Sample unavailable';}finally{$('#reload-button').disabled=false;}}
function bindEvents(){
 $$('[data-tab]').forEach(el=>el.addEventListener('click',()=>tabTo(el.dataset.tab)));
 $('#search').addEventListener('input',renderTable);$('#type-filter').addEventListener('change',renderTable);$('#risk-filter').addEventListener('change',renderTable);
 $$('[data-sort]').forEach(el=>el.addEventListener('click',()=>{state.direction=state.sort===el.dataset.sort?-state.direction:(el.dataset.sort==='name'?1:-1);state.sort=el.dataset.sort;$$('[data-sort] span').forEach(x=>x.textContent='↕');$('span',el).textContent=state.direction===1?'↑':'↓';renderTable();}));
 $('#building-rows').addEventListener('click',e=>{const row=e.target.closest('[data-id]');if(row){state.selected=row.dataset.id;renderTable();renderDetail();}});$('#building-rows').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-id]')){e.preventDefault();state.selected=e.target.dataset.id;renderTable();renderDetail();}});
 $('#upload-button').addEventListener('click',()=>$('#file-input').click());$('#file-input').addEventListener('change',e=>uploadFile(e.target.files[0]));$('#reload-button').addEventListener('click',()=>{$('#search').value='';$('#type-filter').value='';$('#risk-filter').value='';loadPortfolio();});$('#export-button').addEventListener('click',exportScores);
 bindManualEvents();
 ['#model-button','#footer-method'].forEach(s=>$(s).addEventListener('click',methodology));$('#sources-button').addEventListener('click',sourcesDialog);$('#close-dialog').addEventListener('click',()=>$('#info-dialog').close());$('#info-dialog').addEventListener('click',e=>{if(e.target===$('#info-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
 document.addEventListener('submit',e=>{if(e.target.id==='mitigation-form')evaluateMitigation(e);});
 document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;const key=el.dataset.result,action=el.dataset.action;if(action==='add-investigation')addInvestigation(key,Number(el.dataset.driver));if(action==='load-manual')loadManual(key);if(action==='mitigate')mitigateDialog(key);if(action==='toggle-action'){const a=state.actions.find(x=>x.id===el.dataset.actionId);if(a){a.done=!a.done;saveActions();}}if(action==='remove-action'){state.actions=state.actions.filter(x=>x.id!==el.dataset.actionId);saveActions();}});
}
async function init(){$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));buildManual();bindEvents();renderActions();try{state.config=await request('/api/config');refreshManualConfiguration();}catch(error){message(`Scoring configuration unavailable: ${error.message}`,true);}await loadPortfolio();}
init();
