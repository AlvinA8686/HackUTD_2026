import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { WEIGHTS, scoreBuilding } from '../src/risk.js';

let child, base, html, script, benchmarks;
before(async () => {
  const port=40000+Math.floor(Math.random()*10000);base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Test server did not start')),5000).unref())]);
  [html,script,benchmarks]=await Promise.all([readFile('public/index.html','utf8'),readFile('public/app.js','utf8'),readFile('public/data/benchmarks.json','utf8').then(JSON.parse)]);
});
after(()=>child?.kill());

async function waitFor(predicate, message) {
  const deadline=Date.now()+2500;
  while(Date.now()<deadline){if(predicate())return;await new Promise(r=>setTimeout(r,10));}
  throw Error(message);
}
async function app(t, intercept, waitUntilReady=true) {
  const errors=[];
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:base,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  t.after(()=>dom.window.close());
  const w=dom.window, calls=[];
  w.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true';};
  w.fetch=async(url,options={})=>{
    if(url==='/api/score')calls.push(JSON.parse(options.body));
    const real=()=>fetch(new URL(url,base),{...options,headers:{...options.headers,Origin:base}});
    return intercept?intercept(url,options,real):real();
  };
  const source=script.replace(/\ninit\(\);\s*$/,'\nwindow.appReady=init();');
  w.eval(source+'\nwindow.manualTest={state,manualValues,loadManual};');if(waitUntilReady)await w.appReady;
  const d=w.document,form=d.querySelector('#assessment-form'),button=d.querySelector('#assess-button');
  const input=name=>form.elements.namedItem(name);
  function change(name,value,event='input'){input(name).value=String(value);input(name).dispatchEvent(new w.Event(event,{bubbles:true}));}
  const submit=async()=>{button.click();await waitFor(()=>!button.disabled&&(w.manualTest.state.manual||!d.querySelector('#manual-error').classList.contains('hidden')),'Manual submission did not produce a result or an error');};
  return {w,d,form,button,input,change,submit,calls,errors,h:w.manualTest};
}

test('manual calculation submits decimal revenue and displays all system and building scores',async t=>{
  const a=await app(t);a.change('annual_revenue_usd','1234567.89');await a.submit();
  assert.equal(a.calls.length,1);assert.equal(a.calls[0].annual_revenue_usd,1234567.89);
  for(const key of ['electricity','plumbing','hvac','revenue','overall'])assert.ok(Number.isFinite(a.h.state.manual.scores[key]),key);
  assert.match(a.d.querySelector('#manual-result').textContent,/Building priority index/);
  assert.equal(a.d.querySelector('#manual-result').dataset.scrolled,'true');
  assert.deepEqual(a.errors,[]);
});

test('manual inputs are ready during configuration loading and typed values are preserved',async t=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const a=await app(t,async(url,options,real)=>{if(url==='/api/config')await gate;return real();},false);
  assert.equal(a.input('building_type').value,'Technology');a.change('building_age_years',45);
  release();await a.w.appReady;assert.equal(a.input('building_age_years').value,'45');
  await a.submit();assert.equal(a.h.state.manual.building.building_age_years,45);
});

test('missing and impossible fields show accessible errors without scoring blanks as zero',async t=>{
  const a=await app(t);a.change('water_gal_sqft','');a.change('hot_days',366);
  assert.throws(()=>a.h.manualValues(),/Water|water|Hot|hot/);await a.submit();
  assert.equal(a.calls.length,0);assert.equal(a.h.state.manual,null);
  assert.equal(a.input('water_gal_sqft').getAttribute('aria-invalid'),'true');
  assert.equal(a.input('hot_days').getAttribute('aria-invalid'),'true');
  assert.equal(a.d.activeElement.id,'manual-error');
  a.change('water_gal_sqft',0);a.change('hot_days',12);await a.submit();
  assert.equal(a.h.state.manual.building.water_gal_sqft,0);
});

test('editing calculated inputs removes stale scores and recalculates with the new values',async t=>{
  const a=await app(t);await a.submit();const first=a.h.state.manual.scores.overall;
  a.change('electricity_kwh_sqft',150);
  assert.equal(a.h.state.manual,null);assert.doesNotMatch(a.d.querySelector('#manual-result').textContent,/Building priority index/);
  await a.submit();assert.notEqual(a.h.state.manual.scores.overall,first);
});

test('each of the six building types resolves its own reference and exact weights',async t=>{
  const a=await app(t);
  for(const type of Object.keys(WEIGHTS)){
    a.change('building_type',type,'change');await a.submit();
    assert.equal(a.h.state.manual.building.building_type,type);
    assert.equal(JSON.stringify(a.h.state.manual.scores.weights),JSON.stringify(WEIGHTS[type]));
    assert.equal(a.h.state.manual.scores.reference.electricity_kwh_sqft,benchmarks.building_types[type].electricity_kwh_sqft);
  }
});

test('zero values are accepted and submitting the form directly uses the same scoring flow',async t=>{
  const a=await app(t);
  for(const name of ['annual_revenue_usd','electricity_kwh_sqft','electricity_change_pct','water_gal_sqft','water_change_pct','thermal_kbtu_sqft','building_age_years','hot_days','freeze_days'])a.change(name,0);
  a.form.requestSubmit();await waitFor(()=>!!a.h.state.manual,'Direct form submission did not calculate');
  for(const key of ['electricity','plumbing','hvac','revenue','overall'])assert.equal(a.h.state.manual.scores[key],0,key);
});

test('weather-day validation follows the selected reporting year including leap years',async t=>{
  const a=await app(t);a.change('report_year',2024);a.change('hot_days',366);await a.submit();
  assert.equal(a.h.state.manual.building.hot_days,366);assert.equal(a.input('hot_days').max,'366');
  a.change('report_year',2023);await a.submit();
  assert.equal(a.h.state.manual,null);assert.match(a.d.querySelector('#manual-error').textContent,/365/);
});

test('copying a building retains six-decimal inputs and its explicit custom reference',async t=>{
  const a=await app(t),b={...a.h.state.results[0].building,property_type:'Imported custom use',reference_electricity_kwh_sqft:30,reference_water_gal_sqft:50,reference_thermal_kbtu_sqft:60,reference_label:'Imported comparison'};
  a.h.state.results[0]=scoreBuilding(b,benchmarks);const expected=a.h.state.results[0].scores.overall;
  a.h.loadManual('0');await a.submit();
  assert.equal(a.h.state.manual.scores.overall,expected);
  assert.equal(a.calls[0].reference_electricity_kwh_sqft,30);
  a.change('building_type','Healthcare','change');await a.submit();
  assert.equal(a.h.state.manual.scores.reference.electricity_kwh_sqft,benchmarks.building_types.Healthcare.electricity_kwh_sqft);
});

test('failed requests show an error, preserve inputs, hide old scores and support retry',async t=>{
  let fail=false;
  const a=await app(t,async(url,options,real)=>url==='/api/score'&&fail?new Response(JSON.stringify({error:'Please check the water value.',issues:['water_gal_sqft must be a finite number.']}),{status:422,headers:{'Content-Type':'application/json'}}):real());
  await a.submit();a.change('water_gal_sqft','77.123456');fail=true;await a.submit();
  assert.equal(a.button.disabled,false);assert.equal(a.input('water_gal_sqft').value,'77.123456');
  assert.equal(a.h.state.manual,null);assert.equal(a.d.activeElement.id,'manual-error');
  assert.match(a.d.querySelector('#manual-error').textContent,/water|Water/);
  fail=false;await a.submit();assert.ok(a.h.state.manual?.scores);assert.ok(a.d.querySelector('#manual-error').classList.contains('hidden'));
});

test('reset restores the example without changing portfolio filters or retaining an old result',async t=>{
  const a=await app(t);await a.submit();a.d.querySelector('#type-filter').value='Healthcare';
  a.change('electricity_kwh_sqft',123);a.d.querySelector('#reset-manual').click();
  assert.equal(a.input('electricity_kwh_sqft').value,'35');assert.equal(a.input('building_type').value,'Technology');
  assert.equal(a.d.querySelector('#type-filter').value,'Healthcare');assert.equal(a.h.state.manual,null);assert.equal(a.h.state.manualContext,null);
  await a.submit();assert.ok(a.h.state.manual.scores);
});

test('a late response cannot overwrite inputs edited while a calculation was running',async t=>{
  let release,started=false;
  const gate=new Promise(resolve=>release=resolve);
  const a=await app(t,async(url,options,real)=>{const response=await real();if(url==='/api/score'){started=true;await gate;}return response;});
  a.button.click();await waitFor(()=>started,'Score request did not start');assert.equal(a.button.disabled,true);
  a.change('electricity_kwh_sqft',200);release();await new Promise(r=>setTimeout(r,30));
  assert.equal(a.h.state.manual,null);assert.equal(a.button.disabled,false);assert.equal(a.input('electricity_kwh_sqft').value,'200');
  assert.doesNotMatch(a.d.querySelector('#manual-result').textContent,/Building priority index/);
});
