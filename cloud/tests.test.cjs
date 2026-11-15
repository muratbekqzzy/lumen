const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const {webcrypto}=require("node:crypto");
const code=fs.readFileSync("cloud/cloud.js","utf8");
const {browser,api}=require("./browser-fixture.cjs");
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


/* Two independent browser contexts, one authenticated server. No credentials or
   network requests are involved; its compare-and-swap is the deployed API contract. */
function fakeCloud(){
 const accounts=new Map();let current="alice",writes=0,reads=0,online=true,onPut=null,onGet=null,conflicts=0;
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
 return {
  request:async(url,opts={})=>{
   assert.equal(new URL(url,"https://example.github.io").pathname,"/api/sync");
   if(!online)throw Error("Offline");
   if(!current)return json({detail:"Sign in"},401);
   const requestUser=current;let value=accounts.get(current)||{revision:0,state:null};
   if(opts.method==="PUT"){
    const body=JSON.parse(opts.body);
    if(body.userId!==current)return json({detail:"Account changed"},403);
    if(onPut){const callback=onPut;onPut=null;await callback(body)}
    value=accounts.get(current)||{revision:0,state:null};
    if(conflicts>0){conflicts--;return json({detail:"Conflict"},409)}
    if(body.baseRevision!==value.revision)return json({detail:"Conflict"},409);
    accounts.set(current,{revision:value.revision+1,state:structuredClone(body.state)});writes++;
    return json({revision:value.revision+1});
   }
   reads++;
   if(onGet){const callback=onGet;onGet=null;await callback()}
   return json({user:{id:requestUser,email:requestUser+"@example.com"},...structuredClone(value)});
  },
  account:id=>{current=id},network:value=>{online=value},onPut:fn=>{onPut=fn},onGet:fn=>{onGet=fn},conflicts:n=>{conflicts=n},
  stats:()=>({writes,reads}),state:(id="alice")=>structuredClone(accounts.get(id))
 };
}
async function connected(remote,options={}){
 const b=browser({hosted:true,fetch:remote.request,...options});assert.equal(await b.window.LumenCloud.sync(),true);return b;
}
test("automatic account sync publishes edits and another device receives them",async()=>{
 const remote=fakeCloud(),a=await connected(remote);
 const section=await api(a,"POST","/api/containers",{title:"Statistics"});
 const note=await api(a,"POST","/api/notes",{parent_id:section.id,title:"Lecture",body:"First draft"});
 assert.equal(await a.window.LumenCloud.sync(),true);
 const b=await connected(remote);
 assert.equal((await api(b,"GET","/api/notes/"+note.id)).body,"First draft");
 await api(b,"PUT","/api/notes/"+note.id,{body:"Second device"});
 assert.equal(await b.window.LumenCloud.sync(),true);assert.equal(await a.window.LumenCloud.sync(),true);
 assert.equal((await api(a,"GET","/api/notes/"+note.id)).body,"Second device");
 const writes=remote.stats().writes;
 await b.window.LumenCloud.sync();await a.window.LumenCloud.sync();
 assert.equal(remote.stats().writes,writes,"unchanged polling does not write snapshots");
});
test("simultaneous changes preserve both versions in one stable conflict copy",async()=>{
 const remote=fakeCloud(),a=await connected(remote);
 const n=await api(a,"POST","/api/notes",{title:"My Notes",body:"Start"});await a.window.LumenCloud.sync();
 const b=await connected(remote);
 await api(a,"PUT","/api/notes/"+n.id,{body:"A edited this"});
 await api(b,"PUT","/api/notes/"+n.id,{body:"B edited this"});
 await b.window.LumenCloud.sync();await a.window.LumenCloud.sync();await b.window.LumenCloud.sync();await a.window.LumenCloud.sync();
 const pair=Object.values(a.window.LumenCloud.exportData().records).filter(r=>r.id===n.id||r.title?.includes("conflict copy"));
 assert.equal(pair.length,2);assert.deepEqual(new Set(pair.map(r=>r.body)),new Set(["A edited this","B edited this"]));
 assert.deepEqual(JSON.parse(JSON.stringify(a.window.LumenCloud.exportData())),JSON.parse(JSON.stringify(b.window.LumenCloud.exportData())));
});
test("a trusted device reopens its scoped library and syncs without setup",async()=>{
 const remote=fakeCloud(),storage=new Map(),a=await connected(remote,{saved:storage});
 const n=await api(a,"POST","/api/notes",{title:"Persistent",body:"yes"});await a.window.LumenCloud.sync();
 const reopened=await connected(remote,{saved:storage});assert.equal((await api(reopened,"GET","/api/notes/"+n.id)).body,"yes");
 assert.equal(reopened.window.LumenCloud.activeAccountId,"alice");
});
test("an edit during an in-flight upload remains pending and reaches other devices",async()=>{
 const remote=fakeCloud(),a=await connected(remote),n=await api(a,"POST","/api/notes",{title:"Changing",body:"Before request"});
 remote.onPut(async()=>{await api(a,"PUT","/api/notes/"+n.id,{body:"During request"})});
 assert.equal(await a.window.LumenCloud.sync(),true);assert.equal(a.window.LumenCloud.state.pending,true);
 assert.equal((await api(a,"GET","/api/notes/"+n.id)).body,"During request");
 await a.window.LumenCloud.sync();const b=await connected(remote);assert.equal((await api(b,"GET","/api/notes/"+n.id)).body,"During request");
});
test("compare-and-swap conflicts refetch and retry automatically",async()=>{
 const remote=fakeCloud(),a=await connected(remote);await api(a,"POST","/api/notes",{title:"Retry",body:"safe"});remote.conflicts(2);
 assert.equal(await a.window.LumenCloud.sync(),true);assert.equal(a.window.LumenCloud.state.pending,false);
 assert(Object.values(remote.state().state.records).some(n=>n.title==="Retry"));
});
test("offline edits survive reload and automatically reconnect",async()=>{
 const remote=fakeCloud(),storage=new Map(),a=await connected(remote,{saved:storage});
 const n=await api(a,"POST","/api/notes",{title:"Offline",body:"start"});await a.window.LumenCloud.sync();
 a.online.onLine=false;remote.network(false);await api(a,"PUT","/api/notes/"+n.id,{body:"Offline edit"});
 assert.equal(await a.window.LumenCloud.sync(),false);assert.equal(a.window.LumenCloud.state.status,"offline");
 const reopened=browser({hosted:true,fetch:remote.request,saved:storage});assert.equal((await api(reopened,"GET","/api/notes/"+n.id)).body,"Offline edit");
 remote.network(true);await reopened.hooks.online();const b=await connected(remote);assert.equal((await api(b,"GET","/api/notes/"+n.id)).body,"Offline edit");
});
test("switching accounts never uploads the previous account's local cache",async()=>{
 const remote=fakeCloud(),a=await connected(remote);const n=await api(a,"POST","/api/notes",{title:"Alice private",body:"secret"});await a.window.LumenCloud.sync();
 await api(a,"PUT","/api/notes/"+n.id,{body:"Alice unsynced change"});remote.account("bob");await a.window.LumenCloud.sync();
 assert.equal(a.window.LumenCloud.activeAccountId,"bob");assert(!remote.state("bob").state.records[n.id]);assert(!a.window.LumenCloud.exportData().records[n.id]);
 remote.account("alice");await a.window.LumenCloud.sync();assert.equal(a.window.LumenCloud.exportData().records[n.id].body,"Alice unsynced change");
});
test("an account change between download and upload is rejected",async()=>{
 const remote=fakeCloud(),a=await connected(remote);await api(a,"POST","/api/notes",{title:"Private",body:"Alice"});
 remote.onGet(()=>remote.account("bob"));assert.equal(await a.window.LumenCloud.sync(),false);
 assert.equal(remote.state("bob"),undefined);assert.equal(a.window.LumenCloud.state.status,"disconnected");
});
test("undoing a synced creation propagates its deletion without resurrecting it",async()=>{
 const remote=fakeCloud(),a=await connected(remote),n=await api(a,"POST","/api/notes",{title:"Temporary",body:"remove"});await a.window.LumenCloud.sync();
 const b=await connected(remote);await api(a,"POST","/api/undo");await a.window.LumenCloud.sync();await b.window.LumenCloud.sync();await a.window.LumenCloud.sync();
 assert(!a.window.LumenCloud.exportData().records[n.id]);assert(!b.window.LumenCloud.exportData().records[n.id]);
 assert(a.window.LumenCloud.exportData().deleted[n.id]);
});
test("undoing an edit restores a new version and syncs it",async()=>{
 const remote=fakeCloud(),a=await connected(remote),n=await api(a,"POST","/api/notes",{title:"Undo",body:"Original"});await a.window.LumenCloud.sync();
 const b=await connected(remote);await api(a,"PUT","/api/notes/"+n.id,{body:"Replacement"});await a.window.LumenCloud.sync();await b.window.LumenCloud.sync();
 await api(a,"POST","/api/undo");await a.window.LumenCloud.sync();await b.window.LumenCloud.sync();assert.equal((await api(b,"GET","/api/notes/"+n.id)).body,"Original");
});
test("saving a stale editor draft keeps the newly received remote note",async()=>{
 const remote=fakeCloud(),a=await connected(remote),n=await api(a,"POST","/api/notes",{title:"Draft",body:"Original"});await a.window.LumenCloud.sync();
 const b=await connected(remote);await api(a,"GET","/api/notes/"+n.id);
 await api(b,"PUT","/api/notes/"+n.id,{body:"Other device"});await b.window.LumenCloud.sync();await a.window.LumenCloud.sync();
 const r=await api(a,"PUT","/api/notes/"+n.id,{body:"Unsaved draft",expectedBody:"Original"});assert.equal(r.conflictPreserved,true);
 assert.deepEqual(new Set(Object.values(a.window.LumenCloud.exportData().records).filter(x=>x.kind==="note").map(x=>x.body)),new Set(["Other device","Unsaved draft"]));
});
test("a signed-out request does not destroy pending local changes",async()=>{
 const remote=fakeCloud(),a=await connected(remote),n=await api(a,"POST","/api/notes",{title:"Pending",body:"safe"});remote.account(null);
 assert.equal(await a.window.LumenCloud.sync(),false);assert.equal(a.window.LumenCloud.state.status,"disconnected");assert.equal(a.window.LumenCloud.exportData().records[n.id].body,"safe");
});
test("legacy GitHub Pages never requests a token or the unavailable sync endpoint",async()=>{
 let requests=0;const b=browser({fetch:async()=>{requests++;throw Error("No backend")}});await api(b,"POST","/api/notes",{title:"Legacy",body:"safe"});
 assert.equal(await b.window.LumenCloud.sync(),false);assert.equal(requests,0);
 assert(!code.includes("github_pat_"));assert(!code.includes("api.github.com"));
});
test("undo preserves unrelated notes received from another device",async()=>{
 const remote=fakeCloud(),a=await connected(remote),n=await api(a,"POST","/api/notes",{title:"Local item",body:"original"});await a.window.LumenCloud.sync();
 const b=await connected(remote);await api(a,"POST","/api/rename",{id:n.id,title:"Renamed locally"});await a.window.LumenCloud.sync();
 const other=await api(b,"POST","/api/notes",{title:"Other device addition",body:"keep me"});await b.window.LumenCloud.sync();await a.window.LumenCloud.sync();
 await api(a,"POST","/api/undo");await a.window.LumenCloud.sync();await b.window.LumenCloud.sync();
 assert.equal((await api(b,"GET","/api/notes/"+n.id)).title,"Local item");assert.equal((await api(b,"GET","/api/notes/"+other.id)).body,"keep me");
});
test("invalid backup imports leave the existing local library unchanged",async()=>{
 const remote=fakeCloud(),a=await connected(remote),before=JSON.stringify(a.window.LumenCloud.exportData());
 const invalid=JSON.parse(before);invalid.records.bad={id:"bad",kind:"note",title:"invalid",parent:"inbox"};
 assert.throws(()=>a.window.LumenCloud.importData(invalid),/invalid item/);assert.equal(JSON.stringify(a.window.LumenCloud.exportData()),before);
 const unsafe=JSON.parse(before);unsafe.records.bad=JSON.parse('{"id":"bad","kind":"note","title":"invalid","parent":"inbox","created":1,"updated":1,"__proto__":{"polluted":true}}');
 assert.throws(()=>a.window.LumenCloud.importData(unsafe),/unsupported field/);assert.equal(JSON.stringify(a.window.LumenCloud.exportData()),before);
});
test("signed-out visitors get an honest sign-in prompt and are not polled",async()=>{
 const remote=fakeCloud();remote.account(null);let requests=0;
 const b=browser({hosted:true,fetch:async(...args)=>{requests++;return remote.request(...args)}});
 assert.equal(await b.window.LumenCloud.sync(),false);
 assert.equal(b.window.LumenCloud.needsSignIn,true);
 assert.match(b.window.LumenCloud.signInHref(),/^\/signin-with-chatgpt\?return_to=/);
 await assert.rejects(api(b,"POST","/api/containers",{title:"Arabic"}),/Sign in to save changes/);
 const before=requests;await b.hooks.focus();await b.hooks.online();
 assert.equal(requests,before,"no background requests while signed out");
 remote.account("alice");assert.equal(await b.window.LumenCloud.sync(),true);
 assert.equal(b.window.LumenCloud.needsSignIn,false);
});
