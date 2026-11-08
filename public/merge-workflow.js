/* Multi-source import stays inside the existing dashboard dialog and design system. */
window.createMergeWorkflow=function({showDialog,onApply,toast,esc}){
  const d=document,content=d.querySelector('#dialog-content'),dialog=d.querySelector('#info-dialog');
  const state={files:[],fields:[],defaultYear:2023,resolutions:{},report:null,busy:false,error:'',dirty:false,conflictPage:0,applied:null,appliedReport:null,screen:'merge',downloadConfig:null};
  const spec=()=>({files:state.files.map(f=>({id:f.id,kind:f.kind,mapping:{...f.mapping}})),defaultYear:Number(state.defaultYear),resolutions:{...state.resolutions}});
  const visible=()=>dialog.open&&!!content.querySelector('[data-merge-root]');
  const button=(action,label,primary=false,disabled=false)=>`<button type="button" class="button ${primary?'primary':'secondary'}" data-merge-action="${action}" ${disabled?'disabled':''}>${label}</button>`;
  async function api(url,options={}){const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw new Error(data.error||'The import could not be processed.');return data;}
  const jsonOptions=value=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  function updateError(message){state.error=message;const el=content.querySelector('#merge-error');if(el){el.textContent=message;el.classList.toggle('hidden',!message);}}
  function invalidate(){state.dirty=true;state.resolutions={};state.report=null;state.conflictPage=0;renderReview();}
  function render(force=false){
    if(!force&&!visible())return;
    state.screen='merge';
    const files=state.files.map((file,index)=>`<div class="source-card"><div style="display:flex;justify-content:space-between;gap:12px"><div><h4>${esc(file.name)}</h4><p>${file.row_count.toLocaleString()} source rows · ${file.columns.length} columns</p></div>${button(`remove:${index}`,'Remove',false,state.busy)}</div><label class="field"><span>Record type</span><select data-merge-kind="${index}" ${state.busy?'disabled':''}><option value="building" ${file.kind==='building'?'selected':''}>Building records</option><option value="weather" ${file.kind==='weather'?'selected':''}>Shared weather by location/station and year</option></select></label><details style="margin-top:12px"><summary>Review column mapping and units · ${Object.values(file.mapping).filter(Boolean).length} mapped</summary><p>Unmapped columns are ignored for scoring and retained in the original source records.</p><div style="max-height:320px;overflow:auto"><table style="width:100%"><thead><tr><th>Source column</th><th>Use as</th></tr></thead><tbody>${file.columns.map((column,columnIndex)=>`<tr><td style="max-width:180px;overflow-wrap:anywhere">${esc(column)}</td><td><select style="max-width:330px;width:100%" aria-label="Map ${esc(column)} in ${esc(file.name)}" data-merge-map="${index}:${columnIndex}" ${state.busy?'disabled':''}><option value="">Ignore column</option>${state.fields.map(field=>`<option value="${esc(field.key)}" ${file.mapping[column]===field.key?'selected':''}>${esc(field.label)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div><p>File SHA-256: <code style="overflow-wrap:anywhere">${esc(file.sha256)}</code></p></details></div>`).join('');
    showDialog('Connect fragmented datasets.',`<div data-merge-root><p>Select building, utility, financial and annual weather files. Matching uses IDs plus year, or street address with city/state and year. Names alone never merge buildings.</p><div class="download-grid">${button('select','Select datasets',true,state.busy)}${button('demo','Load merge example',false,state.busy)}${state.files.length?button('conflict-demo','Add conflict example',false,state.busy):''}</div><p>CSV, JSON or SQLite · up to 10 files · 10 MiB and 5,000 rows per file. Files stay on the local app; uploaded sources expire after 30 minutes of inactivity.</p><div id="merge-error" class="notice error ${state.error?'':'hidden'}" role="alert">${esc(state.error)}</div><div id="merge-files">${files||'<div class="source-card"><h4>Start with your source files.</h4><p>For example: one building register, one utility dataset and one shared weather dataset.</p></div>'}</div><label class="field"><span>Default reporting year for rows without a year</span><input id="merge-year" type="number" min="1900" max="2100" step="1" value="${esc(state.defaultYear)}" ${state.busy?'disabled':''}><small>Explicit years in a file take precedence. The selected default is recorded in the field provenance.</small></label><div class="download-grid">${button('analyze',state.busy?'Processing…':'Merge & calculate risk',true,state.busy||!state.files.length)}</div><div id="merge-review"></div></div>`,'CONNECT · REVIEW · EXPORT');
    renderReview();
  }
  function renderReview(){
    const target=content.querySelector('#merge-review');if(!target)return;
    const r=state.report;
    if(!r){target.innerHTML=state.files.length?'<p>Review the mappings and reporting year, then merge the files to find matches, conflicts and missing inputs.</p>':'';return;}
    const pending=r.conflicts.filter(c=>!c.resolved),start=state.conflictPage*40,shown=pending.slice(start,start+40),s=r.summary;
    target.innerHTML=`<h3>Merge quality review</h3><div class="source-card"><h4>${s.input_rows.toLocaleString()} source rows → ${s.total.toLocaleString()} building/year records</h4><p><strong>${s.scored} ready to score</strong> · ${s.invalid} need review · ${s.unresolved_conflicts} unresolved conflicts · ${s.resolved_conflicts} resolved</p><p>Only ready records enter the clean database. The review report and SQLite audit tables retain excluded rows and original observations.</p></div>${state.dirty?'<div class="notice">Choices changed. Recalculate before using or exporting this portfolio.</div>':''}${shown.length?`<h3>Choose a source for conflicting values</h3>${shown.map(c=>`<div class="source-card"><h4>${esc(c.field)} · ${esc(c.label)}</h4><p>${c.scope==='weather'?`Shared weather: affects ${c.affected.length} building records.`:'Matching building records contain different values.'}</p><label class="field"><span>Accepted value</span><select data-merge-resolution="${c.id}"><option value="">Keep unresolved</option>${c.candidates.map((candidate,index)=>`<option value="${index}" ${state.resolutions[c.id]===index?'selected':''}>${esc(String(candidate.value))} — ${esc([...new Set(candidate.sources.map(source=>`${source.file}${source.row?`, row ${source.row}`:''}`))].join('; '))}</option>`).join('')}</select></label></div>`).join('')}<p>Showing conflicts ${start+1}–${Math.min(start+40,pending.length)} of ${pending.length}.</p><div class="download-grid">${button('previous-conflicts','Previous',false,state.conflictPage===0)}${button('next-conflicts','Next',false,start+40>=pending.length)}${button('analyze','Apply choices & recalculate',true,state.busy)}</div>`:''}${r.warnings.length?`<details><summary>Import notes (${r.warnings.length})</summary><ul>${r.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`:''}<details ${s.invalid?'open':''}><summary>Building-level quality results</summary><div style="max-height:300px;overflow:auto"><table style="width:100%"><thead><tr><th>Building</th><th>Status</th><th>Risk / issue</th></tr></thead><tbody>${r.results.slice(0,100).map(row=>`<tr><td>${esc(row.building.name||row.building.building_id)}<br><small>${esc(row.building.report_year)}</small></td><td>${row.scores?'Ready':'Needs review'}</td><td>${row.scores?row.scores.overall.toFixed(2):esc(row.error)}</td></tr>`).join('')}</tbody></table></div><p>Previewing up to 100 rows. The portfolio and review report include every building.</p></details><div class="download-grid">${button('apply','Use merged portfolio',true,state.busy||state.dirty)}${button('downloads','Download clean database',false,state.busy||state.dirty||!s.scored)}${button('download:report','Download review report',false,state.busy||state.dirty)}</div>`;
  }
  async function addFiles(files){
    files=Array.from(files||[]);if(!files.length)return;
    if(state.files.length+files.length>10){updateError('Select no more than 10 source files in one merge.');return;}
    if(files.some(f=>f.size>10*1024*1024)){updateError('Each source file must be 10 MiB or smaller.');return;}
    state.busy=true;state.error='';render(true);
    try{
      for(const file of files){
        const data=await api(`/api/fragments?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
        if(state.files.some(f=>f.sha256===data.file.sha256)){await fetch('/api/fragments/'+data.file.id,{method:'DELETE'});toast(`${file.name} is already included; duplicate skipped.`);continue;}
        if(!state.files.length){const yearColumn=Object.keys(data.file.mapping).find(c=>data.file.mapping[c]==='report_year');const years=[...new Set(data.file.preview.map(r=>Number(r?.[yearColumn])).filter(y=>Number.isInteger(y)&&y>=1900&&y<=2100))];if(years.length===1)state.defaultYear=years[0];}
        state.files.push(data.file);state.fields=data.fields;
      }
      invalidate();
    }catch(error){state.error=error.message;}
    finally{state.busy=false;render();d.querySelector('#file-input').value='';}
  }
  async function analyze(){
    state.busy=true;state.error='';render();
    try{state.report=await api('/api/merge',jsonOptions(spec()));state.dirty=false;state.conflictPage=0;}
    catch(error){state.error=error.message;state.report=null;}
    finally{state.busy=false;render();}
  }
  async function demo(conflict=false){
    try{const names=conflict?['conflicting-weather.csv']:['building-register.csv','utility-records.csv','shared-weather.csv'];const files=[];for(const name of names){const response=await fetch('/data/fragments/'+name);if(!response.ok)throw Error('The merge example files could not load.');files.push(new File([await response.arrayBuffer()],name,{type:'text/csv'}));}await addFiles(files);if(conflict)toast('Added intentionally conflicting test weather. Recalculate to review it.');}
    catch(error){updateError(error.message);}
  }
  function showExport(config=state.applied,report=state.appliedReport){
    if(!report||!config)return;state.screen='export';state.downloadConfig=config;
    const s=report.summary;
    showDialog('Download your connected database.',`<div data-merge-root><p><strong>${s.scored} clean building records</strong> with electricity, plumbing, HVAC, revenue and overall risk scores.</p><p>${s.invalid} unresolved or incomplete building records are excluded from the clean buildings table. Their details remain in the review report and SQLite audit tables.</p><div id="merge-error" class="notice error hidden" role="alert"></div><div class="download-grid">${button('download:sqlite','SQLite database',true,!s.scored)}${button('download:csv','Clean CSV',false,!s.scored)}${button('download:json','Clean JSON',false,!s.scored)}${button('download:report','Full review report')}</div><p>SQLite includes source hashes, original source rows, conflict decisions and field-level provenance. All downloads use the current scoring model and your corrected building-type weights.</p></div>`,'CLEAN DATA · COMPLETE LINEAGE');
  }
  async function download(format){
    const config=state.screen==='export'?state.downloadConfig:!state.dirty&&state.report?spec():null;if(!config){updateError('Recalculate the merge before downloading.');return;}
    const buttons=[...content.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try{
      const response=await fetch('/api/merge/export',jsonOptions({...config,format}));
      if(!response.ok){const error=await response.json();throw Error(error.error||'The database could not be exported.');}
      const blob=await response.blob(),url=URL.createObjectURL(blob),a=d.createElement('a');a.href=url;a.download=format==='report'?'merge-review-report.json':`clean-building-database.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Database download prepared.');
    }catch(error){updateError(error.message);}
    finally{buttons.forEach(b=>b.disabled=false);}
  }
  content.addEventListener('change',event=>{
    const el=event.target;
    if(el.dataset.mergeMap){const [file,column]=el.dataset.mergeMap.split(':').map(Number);state.files[file].mapping[state.files[file].columns[column]]=el.value;invalidate();}
    else if(el.dataset.mergeKind!==undefined){state.files[Number(el.dataset.mergeKind)].kind=el.value;invalidate();}
    else if(el.id==='merge-year'){state.defaultYear=Number(el.value);invalidate();}
    else if(el.dataset.mergeResolution){if(el.value==='')delete state.resolutions[el.dataset.mergeResolution];else state.resolutions[el.dataset.mergeResolution]=Number(el.value);state.dirty=true;renderReview();}
  });
  content.addEventListener('click',event=>{
    const el=event.target.closest('[data-merge-action]');if(!el)return;
    const action=el.dataset.mergeAction;
    if(action==='select')d.querySelector('#file-input').click();
    else if(action==='demo')demo();else if(action==='conflict-demo')demo(true);else if(action==='analyze')analyze();
    else if(action==='apply'&&state.report&&!state.dirty){state.applied=spec();state.appliedReport=state.report;onApply(state.report,`Merged ${state.files.length} sources`);dialog.close();toast(`${state.report.summary.scored} ready buildings; ${state.report.summary.invalid} need review.`);}
    else if(action==='downloads')showExport(spec(),state.report);
    else if(action.startsWith('download:'))download(action.split(':')[1]);
    else if(action==='previous-conflicts'){state.conflictPage=Math.max(0,state.conflictPage-1);renderReview();}
    else if(action==='next-conflicts'){state.conflictPage++;renderReview();}
    else if(action.startsWith('remove:')){const [file]=state.files.splice(Number(action.split(':')[1]),1);if(!state.applied?.files.some(f=>f.id===file.id))fetch('/api/fragments/'+file.id,{method:'DELETE'}).catch(()=>{});invalidate();render();}
  });
  return {open:()=>render(true),addFiles,showExport,hasApplied:()=>!!state.applied,clearApplied:()=>{state.applied=null;state.appliedReport=null;}};
};
