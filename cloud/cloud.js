/* Lumen: local-first browser adapter and authenticated automatic sync.
   Does not change or upload the local ~/Knowledge vault. */
(()=>{"use strict";
const LEGACY_DATA="lumen.cloud.data.v1", HOSTED=window.LUMEN_HOSTED===true;
const OWNER_KEY="lumen.account.v1", PREFIX="lumen.account.data.v1.";
let owner=null, DATA=LEGACY_DATA, HISTORY="lumen.cloud.history.v1";
const now=()=>Date.now(), id=p=>p+"_"+crypto.randomUUID().slice(0,12);
const base=()=>({version:1,records:{root:{id:"root",kind:"root",title:"Knowledge",parent:null,created:0,updated:0},inbox:{id:"inbox",kind:"inbox",title:"Inbox",parent:null,created:0,updated:0},archive:{id:"archive",kind:"archive",title:"Archive",parent:null,created:0,updated:0}},deleted:{}});
const copy=x=>JSON.parse(JSON.stringify(x)), load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))||f}catch{return f}};
if(HOSTED){owner=load(OWNER_KEY,null);DATA=PREFIX+(owner||"guest");HISTORY=DATA+".history"}
// Retire the old manually supplied credentials; account sessions stay server-managed.
try{localStorage.removeItem("lumen.cloud.auth.v1");localStorage.removeItem("lumen.cloud.sync.v1");sessionStorage.removeItem("lumen.cloud.session")}catch{}
let db=load(DATA,base()),history=load(HISTORY,[]),busy=false,lastError="",lastSuccess=0;
const openedVersions=new Map();
let resolveReady;const whenReady=new Promise(resolve=>{resolveReady=resolve});
function persistHistory(){
 // Keep undo records proportional to the changed items, not thirty complete vault copies.
 for(const entry of history)if(entry.changed&&entry.db){entry.db={version:1,records:Object.fromEntries(entry.changed.filter(key=>entry.db.records[key]).map(key=>[key,entry.db.records[key]])),deleted:{}}}
 while(history.length&&JSON.stringify(history).length>1024*1024)history.shift();
 for(;;){try{localStorage.setItem(HISTORY,JSON.stringify(history));return}catch{if(history.length){history.shift();continue}try{localStorage.removeItem(HISTORY)}catch{}return}}
}
const save=()=>{
 try{localStorage.setItem(DATA,JSON.stringify(db))}
 catch(error){
  // Undo history must never prevent saving the current library.
  history=[];persistHistory();
  try{localStorage.setItem(DATA,JSON.stringify(db))}catch{alert("Storage is full. Export a backup before continuing.");throw error}
 }
 window.dispatchEvent(new Event("lumen-changed"));queueSync();
};
const snapshot=(message,before)=>{history.push({date:new Date().toISOString(),message,db:before});if(history.length>30)history.shift()};
const mod=(message,fn)=>{
 const before=copy(db),beforeHistory=copy(history);
 try{snapshot(message,before);const result=fn(),entry=history[history.length-1];
  entry.changed=[...new Set([...Object.keys(before.records),...Object.keys(db.records),...Object.keys(before.deleted),...Object.keys(db.deleted)])].filter(key=>JSON.stringify(before.records[key])!==JSON.stringify(db.records[key])||before.deleted[key]!==db.deleted[key]);
  entry.after=Object.fromEntries(entry.changed.map(key=>[key,signature(db,key)]));
  persistHistory();save();return result;
 }catch(e){db=before;history=beforeHistory;try{localStorage.setItem(HISTORY,JSON.stringify(history))}catch{}throw e}
};
const get=i=>db.records[i]&&!db.deleted[i]?db.records[i]:null;
const touch=o=>{o.updated=Math.max(now(),Number(o.updated||0)+1,Number(db.deleted[o.id]||0)+1);delete db.deleted[o.id];return o};
const requireNode=i=>{const x=get(i);if(!x)throw Error("Item not found");return x};
const kids=p=>Object.values(db.records).filter(n=>n.parent===p&&!db.deleted[n.id]).sort((a,b)=>(a.position??a.created??0)-(b.position??b.created??0)||a.title.localeCompare(b.title));
const asTree=(node)=>({...node,children:(node.kind==="lecture"?[]:kids(node.id).map(asTree))});
const tree=()=>({...asTree(requireNode("root")),inbox:asTree(requireNode("inbox")),archive:asTree(requireNode("archive"))});
const breadcrumbs=node=>{let out=[];let n=node;while(n&&n.id!=="root"&&n.id!=="inbox"&&n.id!=="archive"){out.unshift({id:n.id,title:n.title,kind:n.kind});n=get(n.parent)}return out};
const escap=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const md=s=>window.LumenMarkdown?window.LumenMarkdown.render(s):"<p>"+escap(s||"").replace(/\n/g,"<br>")+"</p>";
const desc=n=>({...n,description_html:md(n.description||""),breadcrumbs:breadcrumbs(n)});
const withoutCode=s=>String(s||"").replace(/```[\s\S]*?```|`[^`\n]*`/g," ");
const linksOf=s=>[...withoutCode(s).matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]+)?\]\]/g)].map(m=>m[1].trim()).filter(Boolean);
const partsOf=n=>{
 const out=[{part:n.kind==="lecture"?"My Notes/notes.md":"note",text:String(n.body||"")},{part:"description",text:String(n.description||"")}];
 if(n.kind==="lecture"){
  for(const [name,text] of Object.entries(n.generated||{}))out.push({part:"Generated/"+name,text:String(text)});
  const segments=new Map((n.segments||[]).map(segment=>[segment.id,segment]));
  if(n.chunks?.length)for(const c of n.chunks)out.push({part:"Source/transcript",chunk:c.n,text:[c.slide_text||"",...(c.segmentIds||[]).map(key=>segments.get(key)?.text||"")].join("\n")});
  else out.push({part:"Source/transcript",text:[...segments.values()].map(x=>x.text).join(" ")});
 }
 return out.filter(x=>x.text.trim());
};
const archived=n=>{const seen=new Set();let current=n;while(current&&!seen.has(current.id)){if(current.id==="archive")return true;seen.add(current.id);current=get(current.parent)}return false};
const graph=()=>{
 const nodes=[],edges=[],titles=new Map(),concepts=new Map(),edgeIds=new Set();
 const active=Object.values(db.records).filter(n=>!db.deleted[n.id]&&!["root","inbox","archive"].includes(n.id)&&!archived(n));
 for(const n of active){nodes.push({id:n.id,kind:n.kind,title:n.title,section:sectionOf(n),color:n.color||"",icon:n.icon||""});titles.set(n.title.trim().toLowerCase(),n.id);if(n.parent&&!["root","inbox","archive"].includes(n.parent))edges.push({source:n.parent,target:n.id,type:"contains"})}
 for(const n of active)for(const part of partsOf(n))for(const name of linksOf(part.text)){
  const key=name.toLowerCase(),target=titles.get(key)||"c:"+key,edge=n.id+"\n"+target;
  if(!titles.has(key)&&!concepts.has(key)){concepts.set(key,target);nodes.push({id:target,kind:"concept",title:name,section:null,color:"",icon:""})}
  if(target!==n.id&&!edgeIds.has(edge)){edgeIds.add(edge);edges.push({source:n.id,target,type:"mentions"})}
 }
 const nodeMap=new Map(nodes.map(n=>[n.id,n])),degrees=new Map(),sections=new Map();
 for(const e of edges){degrees.set(e.source,(degrees.get(e.source)||0)+1);degrees.set(e.target,(degrees.get(e.target)||0)+1);const section=nodeMap.get(e.source)?.section;if(section){if(!sections.has(e.target))sections.set(e.target,new Set());sections.get(e.target).add(section)}}
 for(const n of nodes){n.degree=degrees.get(n.id)||0;if(n.kind==="concept")n.bridges=sections.get(n.id)?.size||0}
 return {nodes,edges};
};
const validateSegments=segments=>{
 if(!Array.isArray(segments)||!segments.length)throw Error("Transcript is empty");if(segments.length>50000)throw Error("This transcript has too many segments");
 const seen=new Set();
 for(const x of segments){if(!x||!Number.isInteger(x.id)||x.id<0||seen.has(x.id)||!Number.isFinite(x.start)||!Number.isFinite(x.end)||x.start<0||x.end<x.start||typeof x.text!=="string"||!x.text.trim())throw Error("Transcript contains invalid or duplicate segments");seen.add(x.id)}
 return segments.map(x=>({...x,text:x.text.trim()})).sort((a,b)=>a.start-b.start||a.id-b.id);
};
const lectureUrl=(raw,seconds)=>{try{const u=new URL(raw);if(u.protocol!=="https:"||u.username||u.password)return "";if(seconds!==undefined)u.searchParams.set("start",String(Math.max(0,Math.floor(seconds))));return u.href}catch{return ""}};
function lectureBundle(n){
 openedVersions.set(n.id,fingerprint(n));
 const generated=n.generated||{},segments=n.segments||[],byId=new Map(segments.map(x=>[x.id,x]));
 const timed=n.timed_captions!==false&&!segments.some(x=>x.untimed);
 const duration=segments.reduce((end,x)=>Math.max(end,x.end||0),0);
 const chunks=n.chunks?.length?n.chunks:segments.length?[{n:1,page:null,title:"Transcript",start:0,end:duration,segmentIds:segments.map(x=>x.id)}]:[];
 return {meta:n,chunks:chunks.map(c=>({...c,said:(c.segmentIds||[]).map(key=>byId.get(key)).filter(Boolean),link:timed?lectureUrl(n.panopto_url,c.start):"",time:timed?((c.approximate?"≈ ":"")+Math.floor(c.start/60)+":"+String(Math.floor(c.start%60)).padStart(2,"0")):"Segment "+c.n})),pages_not_shown:[],generated,generated_html:Object.fromEntries(Object.entries(generated).map(([k,v])=>[k,md(v)])),my_notes:n.body||"",my_notes_html:md(n.body),has_audio:false,breadcrumbs:breadcrumbs(n)};
}
const sectionOf=n=>{let p=n;for(let i=0;i<40&&p;i++){if(p.kind==="section")return p.id;p=get(p.parent)}return null};
const result=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
const words=x=>String(x||"").toLowerCase().split(/\s+/).filter(Boolean);
function request(method,path,body){const p=path.split("?")[0],parts=p.split("/").filter(Boolean);const v=parts[1],oid=parts[2];
if(method==="GET"&&p==="/api/tree")return tree();
if(method==="GET"&&p==="/api/history")return history.slice(-30).reverse().map(x=>({date:x.date,message:x.message}));
if(method==="POST"&&p==="/api/undo")return undo();
if(method==="POST"&&p==="/api/containers")return mod("Create section or module",()=>{const parent=requireNode(body.parent_id||"root"),kind=parent.id==="root"?"section":"module";const n={id:id(kind[0]),parent:parent.id,kind,title:body.title,icon:body.icon||"",color:body.color||"",type:body.type||"",description:"",created:now(),updated:now()};db.records[n.id]=n;return n});
if(method==="PATCH"&&v==="containers"){return mod("Update section",()=>{let n=requireNode(oid);for(const k of ["icon","color","type","description"])if(body[k]!==undefined)n[k]=body[k];return touch(n)})}
if(method==="POST"&&p==="/api/notes")return mod("Create note",()=>{const parent=requireNode(body.parent_id||"inbox");const n={id:id("n"),kind:"note",parent:parent.id,title:body.title||"Untitled",body:body.body||"",created:now(),updated:now(),author:"you"};db.records[n.id]=n;return n});
if(method==="GET"&&v==="notes"){const n=requireNode(oid);openedVersions.set(oid,fingerprint(n));return {...n,html:md(n.body),breadcrumbs:breadcrumbs(n)}}
if(method==="PUT"&&v==="notes")return mod("Update note",()=>{const n=preserveEditorVersion(oid,body),conflictPreserved=n.body!==body.body&&body.expectedBody!==undefined&&n.body!==body.expectedBody;n.body=body.body;touch(n);return {...n,html:md(n.body),conflictPreserved}});
if(method==="POST"&&p==="/api/rename")return mod("Rename item",()=>{const n=requireNode(body.id);n.title=body.title;return touch(n)});
if(method==="POST"&&p==="/api/move")return mod("Move item",()=>{const n=requireNode(body.id),parent=requireNode(body.parent_id);if(protectedIds.has(n.id))throw Error("This library folder cannot be moved");if(!["root","inbox","archive","section","module"].includes(parent.kind))throw Error("Choose a folder as the destination");let up=parent;while(up){if(up.id===n.id)throw Error("Cannot move a folder into itself");up=get(up.parent)}n.parent=parent.id;n.position=body.index===undefined?now():body.index;return touch(n)});
if(method==="POST"&&p==="/api/reorder")return mod("Reorder items",()=>{body.ids.forEach((i,idx)=>{const n=get(i);if(n&&n.parent===body.parent_id){n.position=idx;touch(n)}});return {ok:true}});
if(method==="POST"&&p==="/api/archive")return mod("Archive item",()=>{let n=requireNode(body.id);n.previousParent=n.parent;n.parent="archive";touch(n);return {ok:true}});
if(method==="POST"&&p==="/api/restore")return mod("Restore item",()=>{let n=requireNode(body.id);n.parent=get(n.previousParent)?n.previousParent:"inbox";touch(n);return {ok:true}});
if(method==="GET"&&v==="node")return desc(requireNode(oid));
if(method==="GET"&&p==="/api/graph")return graph();
if(method==="GET"&&v==="concept"){
 const name=decodeURIComponent(parts.slice(2).join("/")),key=name.trim().toLowerCase(),mentions=[];
 for(const n of Object.values(db.records)){if(db.deleted[n.id]||archived(n))continue;for(const part of partsOf(n))if(linksOf(part.text).some(x=>x.toLowerCase()===key)){const pos=part.text.toLowerCase().indexOf("[["+key);mentions.push({id:n.id,kind:n.kind,title:n.title,part:part.part,place:breadcrumbs(n).slice(0,-1).map(x=>x.title).join(" › "),snippet_html:md(part.text.slice(Math.max(0,pos-70),Math.max(0,pos-70)+300))})}}
 return {name,mentions};
}
if(method==="GET"&&p==="/api/search"){
 const query=words(new URLSearchParams(path.split("?")[1]).get("q")||"");if(!query.length)return [];
 const out=[];for(const n of Object.values(db.records)){
  if(db.deleted[n.id]||["root","inbox","archive"].includes(n.id))continue;
  const parts=partsOf(n),full=[n.title,...parts.map(x=>x.text)].join("\n").toLowerCase();if(!query.every(w=>full.includes(w)))continue;
  const hit=parts.find(part=>query.every(w=>part.text.toLowerCase().includes(w)))||parts.find(part=>query.some(w=>part.text.toLowerCase().includes(w)))||{text:n.title};
  const index=Math.max(0,hit.text.toLowerCase().indexOf(query[0])-65);
  out.push({id:n.id,kind:n.kind,title:n.title,place:breadcrumbs(n).map(x=>x.title).join(" › "),part:hit.part,chunk:hit.chunk,snippet:hit.text.slice(index,index+260)});if(out.length>=30)break;
 }return out;
}
if(method==="POST"&&p==="/api/render")return {__html:md(body.body)};
if(method==="GET"&&v==="lectures")return lectureBundle(requireNode(oid));
if(method==="POST"&&p==="/api/lectures/from-panopto")return mod("Import lecture transcript",()=>{
 const parent=requireNode(body.parent_id||"inbox");if(!["inbox","section","module"].includes(parent.kind))throw Error("Choose a section or the Inbox");
 const segments=validateSegments(body.segments),url=body.panopto_url?lectureUrl(body.panopto_url):"";
 if(body.panopto_url&&!url)throw Error("Lecture links must use HTTPS and contain no login credentials");
 if(!String(body.title||"Lecture transcript").trim())throw Error("Enter a lecture title");
 const n={...body,id:id("l"),kind:"lecture",parent:parent.id,created:now(),updated:now(),status:"complete",body:"",title:String(body.title||"Lecture transcript").trim(),segments,panopto_url:url,source:url?"panopto-captions":"transcript-import",caption_reviewed:false};
 delete n.parent_id;db.records[n.id]=n;return {id:n.id};
});
if(method==="PUT"&&v==="lectures"&&parts[3]==="transcript")return mod("Correct lecture captions",()=>{
 const segments=validateSegments(body.segments),n=preserveEditorVersion(oid);
 n.segments=segments;n.chunks=body.chunks||n.chunks;n.caption_reviewed=true;
 if(body.generated){n.generated={...(n.generated||{}),...body.generated};n.materials_stale=false;if(body.generated_source)n.generated_source=body.generated_source}
 else n.materials_stale=Boolean(Object.keys(n.generated||{}).length);
 touch(n);return {ok:true};
});

if(method==="PUT"&&v==="lectures"&&parts[3]==="materials")return mod("Save prepared study material",()=>{
 const kinds={"study-pack":"study-pack.md",flashcards:"flashcards.md",resources:"resources.md",explanation:"explain-"+id("e")+".md"},filename=kinds[body.kind];
 if(!filename||typeof body.body!=="string"||!body.body.trim())throw Error("Choose a material type and paste its content");
 if(new TextEncoder().encode(body.body).byteLength>1024*1024)throw Error("Study material must be smaller than 1 MiB");
 const n=preserveEditorVersion(oid);n.generated={...(n.generated||{}),[filename]:body.body};n.generated_source="prepared";n.materials_stale=false;if(body.kind==="study-pack")n.status="complete";touch(n);return {ok:true,filename};
});
if(method==="PUT"&&v==="lectures"&&parts[3]==="notes")return mod("Edit lecture notes",()=>{let n=preserveEditorVersion(oid,body),conflictPreserved=n.body!==body.body&&body.expectedBody!==undefined&&n.body!==body.expectedBody;n.body=body.body;touch(n);return {html:md(n.body),conflictPreserved}});
if(method==="POST"&&p==="/api/lectures")throw Error("Lecture transcription runs on the Mac version. The browser version supports notes and existing text only.");
throw Error("This feature requires the Mac version: "+method+" "+p);
}
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{const u=typeof input==="string"?input:input.url;let url;try{url=new URL(u,location.href)}catch{return realFetch(input,init)}
if(url.origin!==new URL(location.href).origin||!url.pathname.startsWith("/api/")||url.pathname==="/api/sync")return realFetch(input,init);try{let method=(init.method||"GET").toUpperCase(),b=init.body,parsed=b instanceof FormData?Object.fromEntries(b.entries()):typeof b==="string"?JSON.parse(b):{};if(HOSTED&&method!=="GET"&&method!=="POST"&&method!=="PUT"&&method!=="PATCH")throw Error("Unsupported method");
if(HOSTED&&!owner&&method!=="GET"&&url.pathname!=="/api/render")throw Error("Connecting your account. Please wait before editing.");
const out=request(method,url.pathname+url.search,parsed);return out?.__html!==undefined?new Response(out.__html,{headers:{"Content-Type":"text/html"}}):result(out)}catch(e){return result({detail:e.message||String(e)},400)}};

// A checkpoint describes the last server-confirmed version of every record.
// Three-way merging preserves both sides of concurrent edits, including deletes.
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fingerprint=obj=>{const str=stable(obj);let a=2166136261,b=2246822519;for(let i=0;i<str.length;i++){a=Math.imul(a^str.charCodeAt(i),16777619);b=Math.imul(b+str.charCodeAt(i),1597334677)}return (a>>>0).toString(16)+(b>>>0).toString(16)};
const protectedIds=new Set(["root","inbox","archive"]);
const live=(state,key)=>state.records[key]&&!(Number(state.deleted[key]||0)>=Number(state.records[key].updated||0)&&state.deleted[key])?state.records[key]:null;
const signature=(state,key)=>live(state,key)?fingerprint(live(state,key)):state.deleted[key]?"deleted:"+state.deleted[key]:null;
let baseline=load(DATA+".checkpoint",null),user=null,pending=false,dirtyVersion=0,syncTimer=null,retryCount=0,verified=false,lastSyncState="offline",lastSyncMessage="Saved on this device";
function updateIndicator(){
 const b=document.querySelector("#lumen-sync-settings");
 if(b){b.dataset.sync=lastSyncState;b.title="Settings · "+lastSyncMessage;b.setAttribute("aria-label","Settings · "+lastSyncMessage)}
 const line=document.querySelector("#lumen-sync-status-detail");if(line){line.textContent=lastSyncMessage;line.dataset.sync=lastSyncState}
}
function status(state,message){lastSyncState=state;lastSyncMessage=message;lastError=state==="error"?message:"";updateIndicator()}
function checkpoint(state,revision){
 const next={revision,records:Object.fromEntries([...new Set([...Object.keys(state.records),...Object.keys(state.deleted)])].map(key=>[key,signature(state,key)]))};
 localStorage.setItem(DATA+".checkpoint",JSON.stringify(next));baseline=next;
}
function conflictCopy(out,record){
 if(!record||protectedIds.has(record.id))return;
 const key="conflict_"+record.id+"_"+fingerprint(record);
 if(!out.records[key])out.records[key]={...copy(record),id:key,title:(record.title||"Untitled")+" (conflict copy)"};
}
function mergeStates(local,remote,previous=baseline?.records||{}){
 const out={version:1,records:{},deleted:{}};
 const keys=new Set([...Object.keys(local.records),...Object.keys(remote.records),...Object.keys(local.deleted),...Object.keys(remote.deleted)]);
 for(const key of [...keys].sort()){
  if(protectedIds.has(key)){out.records[key]=copy(remote.records[key]||local.records[key]||base().records[key]);continue}
  const a=signature(local,key),b=signature(remote,key),old=previous[key]??null;
  let chosen;
  if(a===b)chosen=local;
  else if(a===old)chosen=remote;
  else if(b===old)chosen=local;
  else if(a===null)chosen=remote;
  else if(b===null)chosen=local;
  else {
   const la=live(local,key),lb=live(remote,key);
   if(!la||!lb){chosen=!la?local:remote;conflictCopy(out,la||lb)}
   else{chosen=a>b?local:remote;conflictCopy(out,a>b?lb:la)}
  }
  const record=live(chosen,key);
  if(record)out.records[key]=copy(record);
  else if(chosen.deleted[key])out.deleted[key]=chosen.deleted[key];
 }
 // Concurrent valid moves can together create a cycle. Keep every item reachable.
 for(const key of Object.keys(out.records).sort()){
  if(protectedIds.has(key))continue;
  const n=out.records[key],seen=new Set([key]);let p=n.parent;
  while(p&&!protectedIds.has(p)&&out.records[p]&&!seen.has(p)){seen.add(p);p=out.records[p].parent}
  if(!p||!out.records[p]||seen.has(p))n.parent=n.kind==="section"?"root":"inbox";
 }
 return out;
}
function saveMerged(merged){
 if(stable(merged)===stable(db))return;
 // Persist before exposing an incoming update: failed disk writes cannot look saved.
 localStorage.setItem(DATA,JSON.stringify(merged));db=merged;
 window.dispatchEvent(new Event("lumen-remote-updated"));
}
function preserveEditorVersion(key,edit={}){
 const n=requireNode(key),opened=openedVersions.get(key);
 if((edit.expectedBody!==undefined&&n.body!==edit.expectedBody&&n.body!==edit.body)||(opened&&opened!==fingerprint(n)))conflictCopy(db,n);
 openedVersions.delete(key);return n;
}
function undo(){
 const last=history[history.length-1];if(!last)throw Error("Nothing to undo");
 if(!last.changed)throw Error("This earlier action cannot be undone safely after the sync upgrade. Your library has not changed.");
 const current=copy(db),restored=copy(db),oldHistory=copy(history);
 try{
  for(const key of last.changed){
   if(protectedIds.has(key))continue;
   if(signature(current,key)!==last.after[key])conflictCopy(restored,live(current,key));
   const previous=last.db.records[key];
   if(previous){restored.records[key]=copy(previous);restored.records[key].updated=Math.max(now(),Number(current.records[key]?.updated||0)+1,Number(current.deleted[key]||0)+1);delete restored.deleted[key]}
   else{delete restored.records[key];restored.deleted[key]=Math.max(now(),Number(current.records[key]?.updated||0)+1,Number(current.deleted[key]||0)+1)}
  }
  db=restored;history.pop();persistHistory();save();return {undone:last.message};
 }catch(e){db=current;history=oldHistory;throw e}
}
function queueSync(delay=650){
 pending=true;dirtyVersion++;clearTimeout(syncTimer);
 if(!HOSTED)return;
 status(navigator.onLine?"pending":"offline",navigator.onLine?"Saved on this device · syncing…":"Saved on this device · waiting for internet");
 syncTimer=setTimeout(()=>sync(),delay);
}
async function fetchSync(options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{return await realFetch("/api/sync",{credentials:"same-origin",cache:"no-store",redirect:"error",...options,signal:controller.signal})}
 finally{clearTimeout(timeout)}
}
function switchAccount(next){
 const changed=owner!==next.id;
 if(changed){
  owner=next.id;localStorage.setItem(OWNER_KEY,JSON.stringify(owner));DATA=PREFIX+owner;HISTORY=DATA+".history";
  db=load(DATA,base());history=load(HISTORY,[]);baseline=load(DATA+".checkpoint",null);openedVersions.clear();dirtyVersion++;pending=false;
  window.dispatchEvent(new Event("lumen-remote-updated"));
 }
 user=next;verified=true;resolveReady(copy(next));
 if(changed)window.dispatchEvent(new Event("lumen-account-ready"));
 return changed;
}
async function sync(){
 if(!HOSTED){status("disconnected","Open the synced Lumen app to connect your devices");return false}
 if(!navigator.onLine){status("offline","Saved on this device · waiting for internet");return false}
 if(busy){pending=true;return false}
 busy=true;clearTimeout(syncTimer);status("syncing","Syncing your library…");let ok=false,authRequired=false;
 try{
  for(let attempt=0;attempt<5;attempt++){
   const response=await fetchSync();
   if(response.status===401){verified=false;user=null;authRequired=true;throw Error("Sign in to resume automatic sync. Your changes are saved on this device.")}
   if(!response.ok)throw Error("Sync is temporarily unavailable. Your changes are saved on this device.");
   const incoming=await response.json();
   if(!incoming.user?.id||!Number.isSafeInteger(incoming.revision)||incoming.revision<0)throw Error("Could not verify your sync account. Your changes remain on this device.");
   const changed=switchAccount(incoming.user),remote=incoming.state||base();
   if(!remote.records||!remote.deleted)throw Error("The cloud library could not be read. Your local library is safe.");
   if(changed&&load(DATA,null)===null&&incoming.state){db=copy(remote);localStorage.setItem(DATA,JSON.stringify(db));window.dispatchEvent(new Event("lumen-remote-updated"))}
   saveMerged(mergeStates(db,remote));
   const sent=copy(db),writeAt=dirtyVersion;
   if(incoming.state&&stable(sent)===stable(remote)){checkpoint(sent,incoming.revision);pending=dirtyVersion!==writeAt;ok=true;break}
   const put=await fetchSync({method:"PUT",headers:{"Content-Type":"application/json","X-Lumen-User":user.id},body:JSON.stringify({userId:user.id,baseRevision:incoming.revision,state:sent})});
   if(put.status===409)continue;
   if(put.status===401||put.status===403){verified=false;user=null;authRequired=true;throw Error("Your sign-in changed. Reload Lumen before syncing. Your changes are saved on this device.")}
   if(!put.ok){let detail="";try{detail=(await put.json()).detail||""}catch{}throw Error(detail||"Could not upload changes. They are saved on this device and will retry automatically.")}
   const receipt=await put.json();if(!Number.isSafeInteger(receipt.revision))throw Error("Sync confirmation was interrupted. Lumen will check again.");
   checkpoint(sent,receipt.revision);pending=dirtyVersion!==writeAt;ok=true;break;
  }
  if(!ok)throw Error("Other devices are updating your library. Retrying shortly…");
  retryCount=0;lastSuccess=now();status(pending?"pending":"synced",pending?"More changes saved on this device · syncing…":"All changes synced · "+new Date().toLocaleTimeString());return true;
 }catch(e){
  pending=true;status(authRequired?"disconnected":navigator.onLine?"error":"offline",e.name==="AbortError"?"Connection timed out. Your changes are saved on this device and will retry.":e.message||"Saved on this device · reconnecting…");return false;
 }finally{
  busy=false;
  if(pending&&!authRequired){const delay=ok?250:Math.min(60000,1000*2**Math.min(retryCount++,6));syncTimer=setTimeout(()=>sync(),delay)}
 }
}
window.addEventListener("online",()=>sync());
window.addEventListener("offline",()=>status("offline","Saved on this device · waiting for internet"));
window.addEventListener("focus",()=>sync());
document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
window.addEventListener("storage",ev=>{
 if(ev.key===OWNER_KEY&&HOSTED&&ev.newValue!==JSON.stringify(owner)){verified=false;user=null;status("disconnected","Account changed in another tab. Reload Lumen to continue.");return}
 if(ev.key===DATA&&ev.newValue){try{const incoming=JSON.parse(ev.newValue);if(incoming?.records){const merged=mergeStates(db,incoming);if(stable(merged)!==stable(db)){saveMerged(merged);queueSync(350)}}}catch(e){console.warn("Could not reconcile Lumen browser tabs",e)}}
});
setInterval(()=>{if(!document.hidden&&HOSTED)sync()},5000);

const st=document.createElement("style");
st.textContent=".lumen-settings-btn{position:relative;flex-shrink:0}.lumen-sync-dot{position:absolute;bottom:0;right:0;width:6px;height:6px;border-radius:50%;background:#9b9b9b;box-shadow:0 0 0 2px var(--bg,#111)}.lumen-settings-btn[data-sync=synced] .lumen-sync-dot{background:#6dbb92}.lumen-settings-btn[data-sync=pending] .lumen-sync-dot,.lumen-settings-btn[data-sync=syncing] .lumen-sync-dot{background:#e6b45b}.lumen-settings-btn[data-sync=error] .lumen-sync-dot{background:#ec8080}#lumen-cloud-modal{position:fixed;inset:0;z-index:9001;background:#000b;display:grid;place-items:center;padding:15px}#lumen-cloud-modal .panel{box-sizing:border-box;width:min(520px,100%);max-height:95vh;overflow:auto;background:var(--panel,#1e2028);color:var(--ink,#f1f1f1);border:1px solid var(--line,#535563);border-radius:18px;padding:22px;font:14px/1.6 system-ui}#lumen-cloud-modal button,#lumen-cloud-modal a.action{display:inline-block;background:#a4c5ff;color:#161923;border:0;padding:9px 13px;border-radius:9px;margin:0 6px 8px 0;cursor:pointer;font:inherit;text-decoration:none}#lumen-cloud-modal button.secondary{background:#373d4c;color:#f1f1f1}#lumen-sync-status-detail[data-sync=error]{color:#e78871}#lumen-sync-status-detail[data-sync=synced]{color:#6dbb92}#lumen-cloud-modal .small{font-size:12px;color:var(--muted,#b6bac7)}";
document.head.append(st);
function downloadBackup(){
 const link=document.createElement("a"),blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
 link.href=URL.createObjectURL(blob);link.download="lumen-backup-"+new Date().toISOString().slice(0,10)+".json";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
function validateImport(data){
 const object=v=>v&&typeof v==="object"&&!Array.isArray(v),validTime=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0,validId=k=>/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(k);
 const safe=(v,depth=0)=>{if(depth>64)throw Error("This backup contains too many nested fields");if(v&&typeof v==="object")for(const [key,value] of Object.entries(v)){if(["__proto__","constructor","prototype"].includes(key))throw Error("This backup contains an unsupported field");safe(value,depth+1)}};
 if(!object(data)||data.version!==1||!object(data.records)||!object(data.deleted)||Object.keys(data).some(k=>!["version","records","deleted"].includes(k)))throw Error("Unsupported backup");
 safe(data);
 if(Object.keys(data.records).length>50000||Object.keys(data.deleted).length>50000)throw Error("This backup has too many items");
 for(const [key,t] of Object.entries(data.deleted))if(!validId(key)||protectedIds.has(key)||!validTime(t))throw Error("This backup contains an invalid deleted item");
 for(const [key,n] of Object.entries(data.records)){
  if(!validId(key)||!object(n)||n.id!==key||!["root","inbox","archive","section","module","note","lecture"].includes(n.kind)||typeof n.title!=="string"||n.title.length>4096||!validTime(n.created)||!validTime(n.updated))throw Error("This backup contains an invalid item");
  if(protectedIds.has(key)?n.kind!==key||n.parent!==null:protectedIds.has(n.kind)||typeof n.parent!=="string"||!validId(n.parent))throw Error("This backup contains an invalid folder");
 }
 for(const key of protectedIds)if(!live(data,key))throw Error("This backup is missing a required library folder");
 for(const key of Object.keys(data.records)){
  if(protectedIds.has(key)||!live(data,key))continue;
  const seen=new Set();let n=live(data,key);
  while(n&&!protectedIds.has(n.id)){if(seen.has(n.id)||seen.size>=256)throw Error("This backup contains a folder cycle");seen.add(n.id);const p=live(data,n.parent);if(!p||!["root","inbox","archive","section","module"].includes(p.kind))throw Error("This backup contains an invalid parent folder");n=p}
 }
 if(new TextEncoder().encode(JSON.stringify(data)).byteLength>8*1024*1024)throw Error("This backup exceeds the 8 MiB automatic sync limit");
}
function importData(data){
 if(HOSTED&&(!verified||!user))throw Error("Connect your account before importing your library.");
 validateImport(data);
 return mod("Import backup",()=>{db=mergeStates(db,data,{});window.dispatchEvent(new Event("lumen-remote-updated"));return true});
}
function settings(){
 document.querySelector("#lumen-cloud-modal")?.remove();const modal=document.createElement("div");modal.id="lumen-cloud-modal";
 const returnTo=encodeURIComponent(location.pathname+location.search+(location.hash||"#/"));
 const account=HOSTED?(user?'<p>Signed in as <strong>'+escap(user.email||"your account")+'</strong>. Open Lumen with this same account on your other devices.</p>':'<p>Sign in to keep your library available across devices.</p><a class="action" target="_top" href="/signin-with-chatgpt?return_to='+returnTo+'">Sign in</a>'):'<p>Your existing library is saved in this browser. Open the synced Lumen app to use it on every device.</p>'+(window.LUMEN_SYNC_URL?'<a class="action" href="'+escap(window.LUMEN_SYNC_URL)+'" target="_top">Open synced Lumen</a>':"");
 modal.innerHTML='<div class="panel" role="dialog" aria-modal="true" aria-label="Lumen settings"><h2>Your library</h2><p id="lumen-sync-status-detail" role="status"></p>'+account+'<p class="small">Changes save on this device immediately. Automatic sync runs while Lumen is open, and resumes when you reconnect. Keep a backup of important work.</p><button id="lumen-close">Close</button><button class="secondary" id="lumen-export">Export backup</button><button class="secondary" id="lumen-import">Import backup</button><input type="file" id="lumen-import-file" accept=".json" hidden>'+(HOSTED&&user?'<button class="secondary" id="lumen-signout">Sign out on this device</button>':"")+'<p id="lumen-form-error" role="alert"></p></div>';
 document.body.append(modal);updateIndicator();
 modal.querySelector("#lumen-close").onclick=()=>modal.remove();
 modal.querySelector("#lumen-export").onclick=downloadBackup;
 modal.querySelector("#lumen-import").onclick=()=>modal.querySelector("#lumen-import-file").click();
 modal.querySelector("#lumen-import-file").onchange=async e=>{const line=modal.querySelector("#lumen-form-error");try{const file=e.target.files?.[0];if(!file)return;importData(JSON.parse(await file.text()));line.textContent=HOSTED?"Backup imported. Syncing automatically…":"Backup imported on this device."}catch(err){line.textContent=err.message}};
 const signout=modal.querySelector("#lumen-signout");if(signout)signout.onclick=async()=>{
  const line=modal.querySelector("#lumen-form-error");signout.disabled=true;
  if(!(await sync())){line.textContent="Reconnect before signing out so every change is saved to your account. You can export a separate backup here.";signout.disabled=false;return}
  verified=false;user=null;localStorage.removeItem(DATA);localStorage.removeItem(HISTORY);localStorage.removeItem(DATA+".checkpoint");owner=null;localStorage.removeItem(OWNER_KEY);db=base();history=[];window.dispatchEvent(new Event("lumen-remote-updated"));location.href="/signout-with-chatgpt?return_to=%2F";
 };
 modal.addEventListener("click",e=>{if(e.target===modal)modal.remove()});
 modal.addEventListener("keydown",e=>{if(e.key==="Escape")modal.remove()});
 modal.querySelector("#lumen-close").focus?.();
}
window.LumenCloud={whenReady,getUser:()=>verified?copy(user):null,get activeAccountId(){return owner},settings,sync,exportData:()=>copy(db),importData,downloadBackup,updateIndicator,get account(){return verified?copy(user):null},get state(){return {status:lastSyncState,message:lastSyncMessage,pending,lastSuccess}}};
if(HOSTED){status("pending","Connecting your library…");setTimeout(sync,0)}else status("disconnected","Saved on this device · open synced Lumen for automatic sync");
})();
