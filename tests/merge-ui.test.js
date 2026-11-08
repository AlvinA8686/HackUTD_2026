import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {JSDOM,VirtualConsole} from 'jsdom';
let child,base,html,appCode,mergeCode;
before(async()=>{
 const port=35000+Math.floor(Math.random()*4000);base=`http://127.0.0.1:${port}`;
 child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server did not start')),5000).unref())]);
 [html,appCode,mergeCode]=await Promise.all([readFile('public/index.html','utf8'),readFile('public/app.js','utf8'),readFile('public/merge-workflow.js','utf8')]);
});after(()=>child?.kill());
async function waitFor(fn,message){const end=Date.now()+5000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error(message);}
async function app(t){
 const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url:base,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document,downloads=[];
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:merge-download';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.fetch=async(url,options={})=>{
  let body=options.body;if(body instanceof w.File){body=await new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(Buffer.from(reader.result));reader.onerror=reject;reader.readAsArrayBuffer(body);});}
  return fetch(new URL(url,base),{...options,body,headers:{...options.headers,Origin:base}});
 };
 w.eval(mergeCode);w.eval(appCode.replace(/\ninit\(\);\s*$/,'\nwindow.appReady=init();'));await w.appReady;
 const click=action=>{const el=d.querySelector(`[data-merge-action="${action}"]`);assert.ok(el,action+' button exists');el.click();};
 const analyze=async()=>{click('analyze');await waitFor(()=>d.querySelector('[data-merge-action="apply"]')&&!d.querySelector('[data-merge-action="analyze"]').disabled,'Merge review did not load');};
 async function demo(){d.querySelector('#upload-button').click();click('demo');await waitFor(()=>d.querySelectorAll('#merge-files>.source-card').length===3&&!d.querySelector('[data-merge-action="analyze"]').disabled,'Demo files did not upload');}
 return {w,d,downloads,errors,click,analyze,demo};
}
test('the existing upload button opens the merge workflow, loads three files, applies scored records and downloads SQLite',async t=>{
 const a=await app(t);assert.match(a.d.title,/Riskalytics/);assert.equal(a.d.querySelector('#file-input').multiple,true);
 await a.demo();await a.analyze();assert.match(a.d.querySelector('#merge-review').textContent,/30 ready to score/);
 a.click('apply');assert.equal(a.d.querySelector('#info-dialog').open,false);assert.equal(a.d.querySelector('#stat-count').textContent,'30');assert.match(a.d.querySelector('#dataset-label').textContent,/Merged 3 sources/);
 a.d.querySelector('#export-button').click();assert.match(a.d.querySelector('#dialog-title').textContent,/Download/);
 a.click('download:sqlite');await waitFor(()=>a.downloads.length===1,'SQLite download did not start');assert.equal(a.downloads[0].type,'application/vnd.sqlite3');
 a.d.querySelector('#sources-button').click();await new Promise(r=>setTimeout(r,20));assert.match(a.d.querySelector('#source-cards').textContent,/building-register\.csv/);assert.doesNotMatch(a.d.querySelector('#source-cards').textContent,/NYC LL84/);
 assert.deepEqual(a.errors,[]);
});
test('the UI flags shared weather conflicts, requires recalculation after a source choice, and resolves every affected building',async t=>{
 const a=await app(t);await a.demo();await a.analyze();a.click('conflict-demo');
 await waitFor(()=>a.d.querySelectorAll('#merge-files>.source-card').length===4&&!a.d.querySelector('[data-merge-action="analyze"]').disabled,'Conflict fixture did not upload');
 await a.analyze();assert.match(a.d.querySelector('#merge-review').textContent,/0 ready to score/);assert.match(a.d.querySelector('#merge-review').textContent,/affects 30 building/);
 const select=a.d.querySelector('[data-merge-resolution]');select.value='0';select.dispatchEvent(new a.w.Event('change',{bubbles:true}));assert.equal(a.d.querySelector('[data-merge-action="apply"]').disabled,true);
 await a.analyze();assert.match(a.d.querySelector('#merge-review').textContent,/30 ready to score/);assert.match(a.d.querySelector('#merge-review').textContent,/1 resolved/);
 a.click('apply');assert.equal(a.d.querySelector('#stat-count').textContent,'30');
});
test('unknown source columns can be mapped in the dialog and then merge with matching records',async t=>{
 const a=await app(t);a.d.querySelector('#upload-button').click();const files=[];
 for(const name of ['building-register.csv','utility-records.csv','shared-weather.csv']){let text=await readFile('public/data/fragments/'+name,'utf8');if(name==='building-register.csv')text=text.replace('building_id','facility_reference');files.push(new a.w.File([text],name,{type:'text/csv'}));}
 const input=a.d.querySelector('#file-input');Object.defineProperty(input,'files',{value:files,configurable:true});input.dispatchEvent(new a.w.Event('change',{bubbles:true}));
 await waitFor(()=>a.d.querySelectorAll('#merge-files>.source-card').length===3&&!a.d.querySelector('[data-merge-action="analyze"]').disabled,'Files did not upload');
 const mapping=a.d.querySelector('[data-merge-map="0:0"]');assert.equal(mapping.value,'');mapping.value='building_id';mapping.dispatchEvent(new a.w.Event('change',{bubbles:true}));
 await a.analyze();assert.match(a.d.querySelector('#merge-review').textContent,/30 ready to score/);
});
test('too many files produces a visible error without erasing the current portfolio',async t=>{
 const a=await app(t);a.d.querySelector('#upload-button').click();const input=a.d.querySelector('#file-input');
 Object.defineProperty(input,'files',{value:Array.from({length:11},(_,i)=>new a.w.File(['id\na'],i+'.csv')),configurable:true});input.dispatchEvent(new a.w.Event('change',{bubbles:true}));
 assert.match(a.d.querySelector('#merge-error').textContent,/no more than 10/);assert.equal(a.d.querySelector('#stat-count').textContent,'30');
});
