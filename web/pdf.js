/* Original slides: account-scoped offline cache, private cloud files, local PDF.js rendering. */
(()=>{'use strict';
const LIMIT=20*1024*1024,HOSTED=window.LUMEN_HOSTED===true;
const SCRIPT=document.currentScript?.src||new URL('web/pdf.js',location.href).href,ASSET=new URL('pdfjs/',SCRIPT).href;
let dbPromise,libraryPromise,epoch=0,fileQueue=Promise.resolve();
function serialize(work){const result=fileQueue.then(work);fileQueue=result.catch(()=>{});return result}
const views=new Set(),documents=new Map(),urls=new Map();
const owner=()=>HOSTED?(window.LumenCloud?.getUser?.()?.id||(!navigator.onLine?window.LumenCloud?.activeAccountId:null)):'legacy';
const keyFor=(account,id)=>account+'|'+id;
function database(){
 if(!globalThis.indexedDB)return Promise.reject(Error('Offline PDF storage is unavailable in this browser.'));
 return dbPromise||=(new Promise((resolve,reject)=>{const request=indexedDB.open('lumen.lecture-pdfs.v1',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('files',{keyPath:'key'});store.createIndex('pending',['owner','pending']);store.createIndex('owner','owner')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)}).catch(error=>{dbPromise=null;throw error}));
}
async function cache(action,value){
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('files',['get','pendingKeys','ownerKeys'].includes(action)?'readonly':'readwrite'),store=tx.objectStore('files');let request;
 if(action==='get')request=store.get(value);else if(action==='pendingKeys')request=store.index('pending').getAllKeys(IDBKeyRange.only([value,0]));else if(action==='ownerKeys')request=store.index('owner').getAllKeys(IDBKeyRange.only(value));else if(action==='put'){value.pending=value.uploaded&&!value.needsLink?1:0;request=store.put(value)}else request=store.delete(value);
 let result;request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||request.error);tx.onabort=()=>reject(tx.error||Error('PDF cache write failed.'));
 });
}
async function pdfLibrary(){
 if(!libraryPromise)libraryPromise=import(ASSET+'pdf.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=ASSET+'pdf.worker.mjs';return pdf}).catch(error=>{libraryPromise=null;throw error});
 return libraryPromise;
}
async function checkedFile(file){
 if(!file||!file.size||file.size>LIMIT)throw Error('Choose a PDF smaller than 20 MiB.');
 const header=new TextDecoder().decode(await file.slice(0,1024).arrayBuffer());if(!header.includes('%PDF-'))throw Error('This file is not a PDF.');return file;
}
async function updateLecture(record){
 if(owner()!==record.owner)throw Error('Your account changed. Reopen the lecture before attaching slides.');
 const response=await fetch('/api/lectures/'+encodeURIComponent(record.lectureId)+'/slides-file',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:{id:record.id,name:record.name,size:record.blob.size,uploaded:record.uploaded},page_count:record.pageCount,expected_file_id:record.needsLink?(record.previousId||null):record.id})});
 if(!response.ok){const data=await response.json();throw Object.assign(Error(data.detail||'Could not attach slides to the lecture.'),{missingLecture:response.status===404||data.detail==='Item not found'})}
 return response.json();
}
async function upload(record){
 if(!HOSTED||!navigator.onLine)return false;
 if(owner()!==record.owner)return false;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);let response;
 try{response=await fetch('/api/lecture-files/'+record.id,{method:'PUT',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/pdf','X-Lumen-User':record.owner,'X-Lumen-Filename':encodeURIComponent(record.name)},body:record.blob})}finally{clearTimeout(timeout)}
 if(!response.ok){const data=await response.json();throw Error(data.detail||'PDF upload failed. Your local PDF is kept.')}
 const receipt=await response.json();if(receipt.id!==record.id)throw Error('PDF upload was not confirmed. Your local copy is kept.');
 record.uploaded=true;try{await cache('put',record)}catch{}return true;
}
function attach(lectureId,file,pageCount){return serialize(()=>attachFile(lectureId,file,pageCount))}
async function attachFile(lectureId,file,pageCount){
 await checkedFile(file);const account=owner();if(!account)throw Error('Sign in before attaching original slides.');
 const existing=await fetch('/api/lectures/'+encodeURIComponent(lectureId));if(!existing.ok)throw Error('Reopen the lecture before attaching slides.');const lecture=await existing.json();
 if(owner()!==account)throw Error('Your account changed. Reopen the lecture before attaching slides.');
 const id=crypto.randomUUID(),record={key:keyFor(account,id),owner:account,id,lectureId,blob:file,name:file.name||'slides.pdf',pageCount,uploaded:false,needsLink:true,previousId:lecture.meta.source_pdf?.id||null};
 let saved=false,uploadError=null;try{await cache('put',record);saved=true}catch{}
 try{await upload(record)}catch(error){uploadError=error}
 if(!saved&&!record.uploaded)throw uploadError||Error('Could not save this PDF. Enable browser storage or reconnect and try again.');
 const result=await updateLecture(record);record.needsLink=false;try{await cache('put',record)}catch{}window.dispatchEvent(new Event('lumen-remote-updated'));
 if(result.superseded)throw Error('The lecture’s selected PDF changed while uploading. Your new PDF was kept, but was not selected. Reopen the lecture and attach it again if needed.');
 return {id,name:record.name,size:file.size,uploaded:record.uploaded,message:record.uploaded?'Original PDF saved to your account.':!HOSTED?'Original PDF saved on this device only. Attach it in synced Lumen for access from other devices.':uploadError?.message||'Original PDF saved on this device. It will upload when you reconnect.'};
}
function flush(){return serialize(flushPending)}
async function flushPending(){
 const account=owner();if(!HOSTED||!account)return false;
 let records;try{records=await cache('pendingKeys',account)}catch{return true}
 if(!records.length)return true;if(!navigator.onLine)return false;
 let okay=true;
 for(const key of records){if(owner()!==account)return false;let record;try{record=await cache('get',key);if(!record)continue;if(!record.uploaded)await upload(record);await updateLecture(record);record.needsLink=false;await cache('put',record);window.dispatchEvent(new Event('lumen-remote-updated'))}catch(error){if(error.missingLecture&&record){try{await cache('delete',record.key)}catch{okay=false}}else okay=false}}
 return okay;
}
async function blobFor(file){
 const account=owner();if(!account)throw Error('Sign in to view your original slides.');
 let record;try{record=await cache('get',keyFor(account,file.id))}catch{}
 if(owner()!==account)throw Error('Your account changed. Reopen the lecture.');
 if(record?.blob)return record.blob;
 if(!HOSTED)throw Error('This original PDF is not saved on this device. Attach the file again.');
 const response=await fetch('/api/lecture-files/'+file.id,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error(response.status===404?'This PDF has not uploaded from the original device yet. Open that device online, or attach the original again.':'Could not load the original PDF. Reconnect and check your sign-in.');
 const blob=await response.blob();if(owner()!==account)throw Error('Your account changed. Reopen the lecture.');
 try{await cache('put',{key:keyFor(account,file.id),owner:account,id:file.id,lectureId:null,name:file.name,blob,uploaded:true})}catch{}
 return blob;
}
async function objectURL(file){const account=owner(),started=epoch,key=keyFor(account,file.id);if(!urls.has(key)){const blob=await blobFor(file);if(owner()!==account||started!==epoch)throw Error('This slide view has closed.');if(!urls.has(key))urls.set(key,URL.createObjectURL(blob))}return urls.get(key)}
async function getDocument(file){
 const account=owner(),key=keyFor(account,file.id);
 if(!documents.has(key)){
  const promise=Promise.all([pdfLibrary(),blobFor(file)]).then(async([pdf,blob])=>{
   if(owner()!==account)throw Error('Your account changed. Reopen the lecture.');
   const task=pdf.getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true,isEvalSupported:false,cMapUrl:ASSET+'cmaps/',cMapPacked:true,standardFontDataUrl:ASSET+'standard_fonts/',wasmUrl:ASSET+'wasm/'});try{return await task.promise}catch(error){await task.destroy();throw error}
  }).catch(error=>{if(documents.get(key)===promise)documents.delete(key);throw error});documents.set(key,promise);
 }
 return documents.get(key);
}
async function extractText(file){
 await checkedFile(file);const pdf=await pdfLibrary();let task;
 try{task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,isEvalSupported:false,cMapUrl:ASSET+'cmaps/',cMapPacked:true,standardFontDataUrl:ASSET+'standard_fonts/',wasmUrl:ASSET+'wasm/'});const document=await task.promise;
  if(document.numPages>300)throw Error('This PDF has more than 300 pages.');
  const pages=[];for(let i=1;i<=document.numPages;i++){const page=await document.getPage(i),content=await page.getTextContent(),lines=content.items.map(x=>x.str||'').filter(Boolean);pages.push({page:i,title:lines.find(x=>x.trim().length>3)?.trim().slice(0,140)||'Slide '+i,text:lines.join(' ').slice(0,16000)})}return pages;
 }finally{await task?.destroy()}
}
function mountPage(host,file,pageNumber=1){
 const mountedAt=epoch,viewOwner=owner();let cancelled=false,task=null,resize=null,intersection=null,busy=false,lastWidth=0,visible=!globalThis.IntersectionObserver;
 const wrapper=document.createElement('div');wrapper.className='pdf-slide';
 const canvas=document.createElement('canvas');canvas.width=canvas.height=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Original PDF slide '+pageNumber);
 const status=document.createElement('p');status.className='pdf-page-status';status.setAttribute('role','status');status.textContent='Loading original slide…';
 const link=document.createElement('a');link.textContent='Open original PDF ↗';link.target='_blank';link.rel='noopener';link.className='pdf-original-link';link.hidden=true;
 const retry=document.createElement('button');retry.type='button';retry.className='btn ghost';retry.textContent='Retry slide';retry.hidden=true;
 wrapper.append(canvas,status,link,retry);host.replaceChildren(wrapper);
 const active=()=>!cancelled&&epoch===mountedAt&&owner()===viewOwner&&host.isConnected&&visible;
 async function draw(){
  if(!active()||busy)return;busy=true;
  try{
   const pdf=await getDocument(file);if(!active())return;
   if(pageNumber<1||pageNumber>pdf.numPages)throw Error('This page is not in the attached PDF. Open the original to check its slide numbering.');
   const page=await pdf.getPage(pageNumber),width=Math.max(180,Math.min(1200,host.clientWidth||600));if(!active())return;
   if(lastWidth&&Math.abs(lastWidth-width)<24)return;lastWidth=width;
   const viewport=page.getViewport({scale:width/page.getViewport({scale:1}).width*Math.min(globalThis.devicePixelRatio||1,2)});
   canvas.hidden=false;canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width='100%';canvas.style.height='auto';
   task=page.render({canvasContext:canvas.getContext('2d'),viewport});await task.promise;
   if(active()){status.hidden=true;retry.hidden=true;link.href=(await objectURL(file))+'#page='+pageNumber;link.hidden=false;}
   page.cleanup();
  }catch(error){if(active()&&error.name!=='RenderingCancelledException'){status.hidden=false;status.textContent=error.message||'Could not render this page.';retry.hidden=false;canvas.hidden=true;try{link.href=(await objectURL(file))+'#page='+pageNumber;link.hidden=false}catch{}}}
  finally{busy=false;if(active()&&!lastWidth&&retry.hidden)queueMicrotask(()=>draw())}
 }
 retry.onclick=()=>{lastWidth=0;retry.hidden=true;status.hidden=false;status.textContent='Loading original slide…';draw()};
 const cleanup=()=>{cancelled=true;task?.cancel?.();resize?.disconnect();intersection?.disconnect();canvas.width=canvas.height=0};views.add(cleanup);
 if(globalThis.ResizeObserver)resize=new ResizeObserver(()=>draw());
 if(globalThis.IntersectionObserver){intersection=new IntersectionObserver(entries=>{visible=entries.some(x=>x.isIntersecting);if(visible){resize?.observe(host);draw()}else{resize?.disconnect();task?.cancel?.();task=null;canvas.width=canvas.height=0;lastWidth=0;status.hidden=false;status.textContent='Slide '+pageNumber;}},{rootMargin:'400px'});intersection.observe(host)}else{resize?.observe(host);draw()}
 return cleanup;
}
function clearViews(){epoch++;for(const cleanup of views)cleanup();views.clear();for(const promise of documents.values())Promise.resolve(promise).then(doc=>doc.loadingTask.destroy()).catch(()=>{});documents.clear();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
async function clearAccountCache(account){let keys;try{keys=await cache('ownerKeys',account)}catch{return}for(const key of keys)await cache('delete',key);clearViews()}
window.LumenPDF={attach,flush,mountPage,extractText,clearViews,clearAccountCache};
window.addEventListener('online',()=>flush());window.addEventListener('focus',()=>flush());setInterval(()=>{if(!document.hidden)flush()},30000);window.addEventListener('lumen-account-ready',()=>flush());
window.LumenCloud?.whenReady?.then(()=>flush());
})();
