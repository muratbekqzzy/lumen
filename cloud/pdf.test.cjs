const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {browser,api}=require('./browser-fixture.cjs');
const pdfCode=fs.readFileSync('web/pdf.js','utf8');
const origin='https://example.github.io';
function fakeIDB(){
 const records=new Map();let fail=false;
 function database(){return {createObjectStore(){return {createIndex(){}}},transaction(){
  const tx={};function request(result,mutation){const r={};queueMicrotask(()=>{if(fail&&mutation){r.error=Error('Storage quota');tx.error=r.error;tx.onerror?.();return}r.result=typeof result==='function'?result():result;r.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.())});return r}
  const store={get:key=>request(records.get(key)),put:value=>request(()=>{records.set(value.key,{...value});return value.key},true),delete:key=>request(()=>records.delete(key),true),index:name=>({getAllKeys:range=>request(()=>[...records].filter(([,r])=>name==='owner'?r.owner===range.value:r.owner===range.value[0]&&r.pending===range.value[1]).map(([key])=>key))})};
  tx.objectStore=()=>store;return tx;
 }}}
 const indexedDB={open(){const request={};queueMicrotask(()=>{request.result=database();request.onupgradeneeded?.();request.onsuccess?.()});return request}};
 return {records,indexedDB,IDBKeyRange:{only:value=>({value})},set fail(value){fail=value}};
}
async function world(){
 const {handleLectureFiles}=await import('../hosted/files.mjs');
 const objects=new Map(),states=new Map();let requests=0,failUploads=false;
 const BUCKET={head:async key=>{const x=objects.get(key);return x?{size:x.bytes.length,customMetadata:x.metadata}:null},get:async key=>{const x=objects.get(key);return x?{size:x.bytes.length,customMetadata:x.metadata,body:x.bytes}:null},put:async(key,bytes,opt)=>objects.set(key,{bytes:new Uint8Array(bytes),metadata:opt.customMetadata}),list:async({prefix})=>({objects:[...objects].filter(([key])=>key.startsWith(prefix)).map(([key,x])=>({key,size:x.bytes.length})),truncated:false})};
 const account={id:'alice'};
 async function fetch(url,options={}){
  if(new URL(url,origin).pathname==='/api/sync'){
   const old=states.get(account.id)||{revision:0,state:null};if(options.method==='PUT'){const body=JSON.parse(options.body);if(body.userId!==account.id)return Response.json({detail:'Account changed'},{status:403});if(body.baseRevision!==old.revision)return Response.json({detail:'Conflict'},{status:409});states.set(account.id,{revision:old.revision+1,state:body.state});return Response.json({revision:old.revision+1})}
   return Response.json({user:{id:account.id,email:account.id+'@example.com'},...old});
  }
  requests++;if(failUploads)throw Error('Upload interrupted');const headers=new Headers(options.headers);headers.set('oai-authenticated-user-id',account.id);
  return handleLectureFiles(new Request(new URL(url,origin),{...options,headers}),{BUCKET});
 }
 return {fetch,objects,states,account,get requests(){return requests},set failUploads(value){failUploads=value}};
}
async function device(remote,store=fakeIDB()){
 const b=browser({hosted:true,fetch:remote.fetch});assert(await b.window.LumenCloud.sync());
 Object.assign(b.context,{fetch:b.window.fetch,indexedDB:store.indexedDB,IDBKeyRange:store.IDBKeyRange,Blob,File,Request,queueMicrotask});
 vm.runInContext(pdfCode,b.context,{filename:'web/pdf.js'});return {...b,store,pdf:b.window.LumenPDF};
}
const file=()=>new File(['%PDF-1.7\nOriginal lecture fixture\n%%EOF'],'Lecture slides.pdf',{type:'application/pdf'});
async function lecture(device){return api(device,'POST','/api/lectures/from-panopto',{title:'Lecture',segments:[{id:0,start:0,end:1,text:'Source'}]})}
test('original PDF uploads privately, while library sync carries only a small file reference',async()=>{
 const remote=await world(),a=await device(remote),n=await lecture(a),result=await a.pdf.attach(n.id,file(),4);
 assert(result.uploaded);assert.equal(remote.objects.size,1);
 const record=a.window.LumenCloud.exportData().records[n.id];assert.equal(record.source_pdf.id,result.id);assert.equal(record.slide_count,4);assert(!JSON.stringify(record).includes('%PDF-'));
 await a.window.LumenCloud.sync();const b=await device(remote);assert.equal(b.window.LumenCloud.exportData().records[n.id].source_pdf.id,result.id);
});
test('offline PDFs stay cached and upload after reconnecting without asking for the file again',async()=>{
 const remote=await world(),a=await device(remote),n=await lecture(a);a.online.onLine=false;
 const attached=await a.pdf.attach(n.id,file(),3);assert(!attached.uploaded);assert.equal(remote.objects.size,0);assert.equal(a.store.records.size,1);
 a.online.onLine=true;assert(await a.pdf.flush());assert.equal(remote.objects.size,1);assert(a.window.LumenCloud.exportData().records[n.id].source_pdf.uploaded);
 const count=remote.requests;await a.pdf.flush();assert.equal(remote.requests,count,'completed PDFs do not upload repeatedly');
});
test('transient cloud failures retain the original locally and can retry safely',async()=>{
 const remote=await world(),a=await device(remote),n=await lecture(a);remote.failUploads=true;
 const result=await a.pdf.attach(n.id,file(),1);assert(!result.uploaded);assert.equal(a.store.records.size,1);
 remote.failUploads=false;assert(await a.pdf.flush());assert.equal(remote.objects.size,1);
});
test('account-scoped caches are cleared on sign-out without removing another account files',async()=>{
 const remote=await world(),a=await device(remote),n=await lecture(a);await a.pdf.attach(n.id,file(),1);
 a.store.records.set('bob|id',{key:'bob|id',owner:'bob',blob:file(),pending:1});
 await a.pdf.clearAccountCache('alice');assert.deepEqual([...a.store.records.keys()],['bob|id']);
});
test('invalid PDFs and unavailable offline storage never create a false saved attachment',async()=>{
 const remote=await world(),a=await device(remote),n=await lecture(a);
 await assert.rejects(()=>a.pdf.attach(n.id,new File(['invalid'],'bad.pdf'),1),/not a PDF/);assert(!a.window.LumenCloud.exportData().records[n.id].source_pdf);
 a.store.fail=true;a.online.onLine=false;await assert.rejects(()=>a.pdf.attach(n.id,file(),1),/Could not save/);assert(!a.window.LumenCloud.exportData().records[n.id].source_pdf);
});
test('an older pending upload cannot replace the selected newer PDF',async()=>{
 const remote=await world(),a=await device(remote),n=await lecture(a);a.online.onLine=false;
 const first=await a.pdf.attach(n.id,file(),4),second=await a.pdf.attach(n.id,new File(['%PDF-1.7\nUpdated lecture\n%%EOF'],'Updated.pdf'),2);
 assert.notEqual(first.id,second.id);a.online.onLine=true;assert(await a.pdf.flush());
 const current=a.window.LumenCloud.exportData().records[n.id];assert.equal(current.source_pdf.id,second.id);assert.equal(current.slide_count,2);assert(current.source_pdf.uploaded);
});
test('concurrent flush requests wait for the same serialized uploads',async()=>{
 const remote=await world(),a=await device(remote),n=await lecture(a);a.online.onLine=false;await a.pdf.attach(n.id,file(),1);a.online.onLine=true;
 assert.deepEqual(await Promise.all([a.pdf.flush(),a.pdf.flush()]),[true,true]);assert.equal(remote.objects.size,1);assert.equal(remote.requests,1);
});
