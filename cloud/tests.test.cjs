const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const {webcrypto}=require("node:crypto");
const code=fs.readFileSync("cloud/cloud.js","utf8");
function browser(options={}){
 const saved=options.saved||new Map(),session=options.session||new Map(),hooks={};
 if(options.credentials){const c=options.credentials;saved.set("lumen.cloud.sync.v1",JSON.stringify({owner:c.owner,repo:c.repo}));saved.set("lumen.cloud.auth.v1",JSON.stringify(c));}
 const localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
 const fakeElement=()=>({style:{},innerHTML:"",onclick:null,append(){},remove(){},querySelector(){return fakeElement()},addEventListener(){}});
 const document={head:{append(){}},body:{append(){}},activeElement:{matches:()=>false},createElement:fakeElement,querySelector(){return null},addEventListener(n,cb){hooks[n]=cb},hidden:false};
 const window={fetch:options.fetch||async()=>new Response("",{status:404}),addEventListener(n,fn){hooks[n]=fn},dispatchEvent(){},location:{href:"https://example.github.io/lumen/"},navigator:{onLine:true}};
 const context={window,document,localStorage,sessionStorage,crypto:webcrypto,TextEncoder,TextDecoder,Response,URL,URLSearchParams,FormData,AbortController,
    Event, navigator:{onLine:true},location:{href:"https://example.github.io/lumen/"},setTimeout:()=>0,clearTimeout(){},setInterval(){},console,confirm:()=>true,alert:()=>{},btoa,atob};
 vm.createContext(context);
 vm.runInContext(code,context,{filename:"cloud/cloud.js"});
 vm.runInContext(fs.readFileSync("cloud/panopto.js","utf8"),context,{filename:"cloud/panopto.js"});
 return {window,localStorage,sessionStorage,hooks};
}
async function api(browser,method,path,body){
 const r=await browser.window.fetch("https://example.github.io"+path,{method,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();
 if(!r.ok)throw Error(data.detail);
 return JSON.parse(JSON.stringify(data));
}
test("offline browser initializes knowledge tree",async()=>{
 const b=browser(),t=await api(b,"GET","/api/tree");
 assert.equal(t.id,"root");assert.equal(t.inbox.id,"inbox");assert.equal(t.archive.id,"archive");
});
test("notes are editable, searchable, and included in graph",async()=>{
 const b=browser();
 const sec=await api(b,"POST","/api/containers",{parent_id:"root",title:"Psychology",color:"#aabbcc"});
 const note=await api(b,"POST","/api/notes",{parent_id:sec.id,title:"Memory",body:"A [[Hippocampus]] concept"});
 assert.equal((await api(b,"GET","/api/notes/"+note.id)).title,"Memory");
 const graph=await api(b,"GET","/api/graph");
 assert(graph.nodes.find(n=>n.id==="c:hippocampus"));
 assert(graph.edges.find(e=>e.source===note.id&&e.target==="c:hippocampus"));
 const found=await api(b,"GET","/api/search?q=hippocampus");assert.equal(found[0].id,note.id);
 const edited=await api(b,"PUT","/api/notes/"+note.id,{body:"Updated writing"});
 assert(edited.html.includes("Updated"));
 assert.equal((await api(b,"GET","/api/notes/"+note.id)).body,"Updated writing");
});
test("moves, archiving, restoring, and undo work",async()=>{
 const b=browser();
 const first=await api(b,"POST","/api/containers",{title:"First",parent_id:"root"});
 const second=await api(b,"POST","/api/containers",{title:"Second",parent_id:"root"});
 const n=await api(b,"POST","/api/notes",{parent_id:first.id,title:"Item"});
 await api(b,"POST","/api/move",{id:n.id,parent_id:second.id});
 assert.equal((await api(b,"GET","/api/tree")).children.find(c=>c.id===second.id).children[0].id,n.id);
 await assert.rejects(()=>api(b,"POST","/api/move",{id:first.id,parent_id:first.id}),/Cannot move/);
 await api(b,"POST","/api/archive",{id:n.id});
 assert.equal((await api(b,"GET","/api/tree")).archive.children[0].id,n.id);
 await api(b,"POST","/api/restore",{id:n.id});
 assert.equal((await api(b,"GET","/api/tree")).children.find(c=>c.id===second.id).children[0].id,n.id);
 await api(b,"POST","/api/rename",{id:n.id,title:"Renamed"});
 await api(b,"POST","/api/undo");
 assert.equal((await api(b,"GET","/api/notes/"+n.id)).title,"Item");
});
test("data persists between page loads",async()=>{
 const b=browser();await api(b,"POST","/api/containers",{title:"Persistent",parent_id:"root"});
 assert(JSON.parse(b.localStorage.getItem("lumen.cloud.data.v1")).records);
});

test("timed Panopto captions keep their timestamps and cleanup duplicates",()=>{
 const b=browser(), parser=b.window.LumenPanopto.parseCaptions;
 const out=parser("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nThe hippocampus.\n\n00:00:03.000 --> 00:00:05.000\nThe hippocampus.\n\n00:00:06.000 --> 00:00:09.500\nWorking memory.");
 assert.equal(out.timed,true);
 assert.equal(out.segments.length,2);
 assert.equal(out.segments[0].end,5);
 assert.equal(out.segments[1].text,"Working memory.");
});
test("Panopto TXT transcript imports without pretending it has timestamps",()=>{
 const b=browser(), parsed=b.window.LumenPanopto.parseCaptions("This is the introduction to memory.\n\nThe hippocampus supports memory encoding.","panopto.txt");
 assert.equal(parsed.timed,false);
 assert.equal(parsed.segments.length,2);
 const pages=[{page:1,title:"Memory",text:"Memory systems"},{page:2,title:"Hippocampus",text:"Hippocampus and encoding"}];
 const chunks=b.window.LumenPanopto.align(pages,parsed.segments,false);
 assert.equal(chunks.length,2);
 assert(chunks.every(c=>c.approximate===true));
 const pack=b.window.LumenPanopto.makePack("Lecture",parsed.segments,pages,chunks,false);
 assert(pack["study-pack.md"].includes("estimated"));
});
test("Panopto import and corrected captions are saved in Lumen offline storage",async()=>{
 const b=browser(), parent=await api(b,"POST","/api/containers",{parent_id:"root",title:"Psychology"});
 const n=await api(b,"POST","/api/lectures/from-panopto",{parent_id:parent.id,title:"Memory",segments:[{id:0,start:0,end:4,text:"hipocampus"}],chunks:[{n:1,page:null,title:"Intro",start:0,end:4,segmentIds:[0]}],generated:{"study-pack.md":"# Intro"}});
 const bundle=await api(b,"GET","/api/lectures/"+n.id);
 assert.equal(bundle.chunks[0].said[0].text,"hipocampus");
 await api(b,"PUT","/api/lectures/"+n.id+"/transcript",{segments:[{id:0,start:0,end:4,text:"hippocampus"}],chunks:bundle.chunks,generated:{"study-pack.md":"# Corrected"}});
 const edited=await api(b,"GET","/api/lectures/"+n.id);
 assert.equal(edited.chunks[0].said[0].text,"hippocampus");
 assert.equal(edited.generated["study-pack.md"],"# Corrected");
});


/* Real sync path against a fake GitHub Contents API. No GitHub secrets or
   network calls are used. Both browser instances share one encrypted file. */
function fakeGithub(){
 let file=null, sha=0, writes=0, reads=0;
 return {
  request:async (url,opts={})=>{
   const path=new URL(url).pathname;
   if(!path.startsWith("/repos/"))throw Error("Unexpected GitHub request "+url);
   if(path.endsWith("/contents/lumen-vault.enc.json")){
    if((opts.method||"GET")==="PUT"){
     const obj=JSON.parse(opts.body);
     if(file&&obj.sha!==String(sha))return new Response(JSON.stringify({message:"Conflict"}),{status:409,headers:{"Content-Type":"application/json"}});
     if(!file&&obj.sha!==undefined)return new Response("Conflict",{status:409});
     file=Buffer.from(obj.content,"base64").toString("utf8");sha++;writes++;
     return new Response(JSON.stringify({content:{sha:String(sha)}}),{status:200,headers:{"Content-Type":"application/json"}});
    }
    reads++;
    if(!file)return new Response("Not found",{status:404});
    return new Response(JSON.stringify({sha:String(sha),size:file.length,content:Buffer.from(file).toString("base64")}),{status:200,headers:{"Content-Type":"application/json"}});
   }
   return new Response(JSON.stringify({private:true}),{status:200,headers:{"Content-Type":"application/json"}});
  },
  stats:()=>({reads,writes})
 };
}
const creds={owner:"muratbekqzzy",repo:"lumen-personal-test",token:"github_pat_test",passphrase:"test-only-encryption-phrase"};
test("encrypted sync publishes edits and another browser receives them",async()=>{
 const remote=fakeGithub();
 const a=browser({fetch:remote.request,credentials:creds});
 const s=await api(a,"POST","/api/containers",{parent_id:"root",title:"Statistics"});
 const n=await api(a,"POST","/api/notes",{parent_id:s.id,title:"Lecture A",body:"First draft"});
 assert.equal(await a.window.LumenCloud.sync(),true);
 const b=browser({fetch:remote.request,credentials:creds});
 assert.equal(await b.window.LumenCloud.sync(),true);
 assert.equal((await api(b,"GET","/api/notes/"+n.id)).body,"First draft");
 await api(b,"PUT","/api/notes/"+n.id,{body:"Corrected from second device"});
 assert.equal(await b.window.LumenCloud.sync(),true);
 assert.equal(await a.window.LumenCloud.sync(),true);
 assert.equal((await api(a,"GET","/api/notes/"+n.id)).body,"Corrected from second device");
 assert(remote.stats().writes>=2);
});
test("simultaneous changes produce one stable conflict copy rather than overwrite",async()=>{
 const remote=fakeGithub();
 const a=browser({fetch:remote.request,credentials:creds});
 const n=await api(a,"POST","/api/notes",{parent_id:"inbox",title:"My Notes",body:"Start"});
 assert.equal(await a.window.LumenCloud.sync(),true);
 const b=browser({fetch:remote.request,credentials:creds});
 assert.equal(await b.window.LumenCloud.sync(),true);
 await api(a,"PUT","/api/notes/"+n.id,{body:"A edited this"});
 await api(b,"PUT","/api/notes/"+n.id,{body:"B edited this"});
 assert.equal(await b.window.LumenCloud.sync(),true);
 assert.equal(await a.window.LumenCloud.sync(),true);
 assert.equal(await b.window.LumenCloud.sync(),true);
 assert.equal(await a.window.LumenCloud.sync(),true);
 const records=Object.values(a.window.LumenCloud.exportData().records);
 const pair=records.filter(r=>r.id===n.id||r.title?.includes("conflict copy"));
 assert.equal(pair.length,2,"Keep both versions, but no duplicate storm");
 assert.deepEqual(new Set(pair.map(r=>r.body)),new Set(["A edited this","B edited this"]));
 assert.equal((await api(b,"GET","/api/notes/"+n.id)).body,(await api(a,"GET","/api/notes/"+n.id)).body);
});
test("stored credentials let a fresh browser instance sync without clicking",async()=>{
 const remote=fakeGithub(),storage=new Map();
 const a=browser({saved:storage,fetch:remote.request,credentials:creds});
 await api(a,"POST","/api/notes",{parent_id:"inbox",title:"Stay connected",body:"yes"});
 assert.equal(await a.window.LumenCloud.sync(),true);
 const reopened=browser({saved:storage,fetch:remote.request});
 assert.equal(await reopened.window.LumenCloud.sync(),true);
 assert((await api(reopened,"GET","/api/tree")).inbox.children.some(n=>n.title==="Stay connected"));
});
