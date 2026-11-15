/* Lumen: browser adapter, offline data and encrypted GitHub sync.
   Does not change or upload the local ~/Knowledge vault. */
(()=>{"use strict";
const DATA="lumen.cloud.data.v1", CFG="lumen.cloud.sync.v1", HISTORY="lumen.cloud.history.v1";
const now=()=>Date.now(), id=p=>p+"_"+crypto.randomUUID().slice(0,12);
const base=()=>({version:1,records:{root:{id:"root",kind:"root",title:"Knowledge",parent:null,created:now(),updated:now()},inbox:{id:"inbox",kind:"inbox",title:"Inbox",parent:null,created:now(),updated:now()},archive:{id:"archive",kind:"archive",title:"Archive",parent:null,created:now(),updated:now()}},deleted:{}});
const copy=x=>JSON.parse(JSON.stringify(x)), load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))||f}catch{return f}};
let db=load(DATA,base()), history=load(HISTORY,[]),cfg=load(CFG,null), busy=false, timer, lastError="",lastSuccess=0;
const save=()=>{try{localStorage.setItem(DATA,JSON.stringify(db));window.dispatchEvent(new Event("lumen-changed"));queueSync()}catch(e){alert("Storage is full. Export a backup before continuing.");throw e}};
const snapshot=message=>{history.push({date:new Date().toISOString(),message,db:copy(db)});if(history.length>30)history.shift();try{localStorage.setItem(HISTORY,JSON.stringify(history))}catch{}};
const mod=(message,fn)=>{snapshot(message);const result=fn();save();return result};
const get=i=>db.records[i]&&!db.deleted[i]?db.records[i]:null;
const touch=o=>{o.updated=now();return o};
const requireNode=i=>{const x=get(i);if(!x)throw Error("Item not found");return x};
const kids=p=>Object.values(db.records).filter(n=>n.parent===p&&!db.deleted[n.id]).sort((a,b)=>(a.position??a.created??0)-(b.position??b.created??0)||a.title.localeCompare(b.title));
const asTree=(node)=>({...node,children:(node.kind==="lecture"?[]:kids(node.id).map(asTree))});
const tree=()=>({...asTree(requireNode("root")),inbox:asTree(requireNode("inbox")),archive:asTree(requireNode("archive"))});
const breadcrumbs=node=>{let out=[];let n=node;while(n&&n.id!=="root"&&n.id!=="inbox"&&n.id!=="archive"){out.unshift({id:n.id,title:n.title,kind:n.kind});n=get(n.parent)}return out};
const escap=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const md=s=>{let src=escap(s||"");src=src.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,a,b)=>`[${b||a}](#/concept/${encodeURIComponent(a)})`);
 src=src.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#\/[^)]+)\)/g,(_,t,u)=>`<a href="${u}" ${u.startsWith("http")?'target="_blank" rel="noopener noreferrer"':""}>${t}</a>`);
 src=src.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>").replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\*(.*?)\*/g,"<em>$1</em>").replace(/\n/g,"<br>");return src};
const desc=n=>({...n,description_html:md(n.description||""),breadcrumbs:breadcrumbs(n)});
const graph=()=>{let nodes=[],edges=[],titles=new Map(),concepts=new Map();for(const n of Object.values(db.records)){if(db.deleted[n.id]||["root","inbox","archive"].includes(n.id))continue;nodes.push({id:n.id,kind:n.kind,title:n.title,section:sectionOf(n),color:n.color||"",icon:n.icon||""});titles.set(n.title.trim().toLowerCase(),n.id);if(n.parent&&!["root","inbox","archive"].includes(n.parent))edges.push({source:n.parent,target:n.id,type:"contains"})}
for(const n of Object.values(db.records)){if(db.deleted[n.id])continue;const text=(n.body||"")+"\n"+(n.description||"");for(const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)){const name=m[1].trim(),key=name.toLowerCase();let target=titles.get(key)||"c:"+key;if(!titles.has(key)&&!concepts.has(key)){concepts.set(key,target);nodes.push({id:target,kind:"concept",title:name,section:null,color:"",icon:""})}if(target!==n.id&&!edges.some(e=>e.source===n.id&&e.target===target))edges.push({source:n.id,target,type:"mentions"})}}
for(const n of nodes){n.degree=edges.filter(e=>e.source===n.id||e.target===n.id).length;if(n.kind==="concept"){const sections=new Set(edges.filter(e=>e.target===n.id).map(e=>nodes.find(x=>x.id===e.source)?.section).filter(Boolean));n.bridges=sections.size}}
return {nodes,edges}};
const sectionOf=n=>{let p=n;for(let i=0;i<40&&p;i++){if(p.kind==="section")return p.id;p=get(p.parent)}return null};
const result=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
const words=x=>String(x||"").toLowerCase().split(/\s+/).filter(Boolean);
function request(method,path,body){const p=path.split("?")[0],parts=p.split("/").filter(Boolean);const v=parts[1],oid=parts[2];
if(method==="GET"&&p==="/api/tree")return tree();
if(method==="GET"&&p==="/api/history")return history.slice(-30).reverse().map(x=>({date:x.date,message:x.message}));
if(method==="POST"&&p==="/api/undo"){const last=history.pop();if(!last)throw Error("Nothing to undo");db=last.db;localStorage.setItem(HISTORY,JSON.stringify(history));save();return {undone:last.message}}
if(method==="POST"&&p==="/api/containers")return mod("Create section or module",()=>{const parent=requireNode(body.parent_id||"root"),kind=parent.id==="root"?"section":"module";const n={id:id(kind[0]),parent:parent.id,kind,title:body.title,icon:body.icon||"",color:body.color||"",type:body.type||"",description:"",created:now(),updated:now()};db.records[n.id]=n;return n});
if(method==="PATCH"&&v==="containers"){return mod("Update section",()=>{let n=requireNode(oid);for(const k of ["icon","color","type","description"])if(body[k]!==undefined)n[k]=body[k];return touch(n)})}
if(method==="POST"&&p==="/api/notes")return mod("Create note",()=>{const parent=requireNode(body.parent_id||"inbox");const n={id:id("n"),kind:"note",parent:parent.id,title:body.title||"Untitled",body:body.body||"",created:now(),updated:now(),author:"you"};db.records[n.id]=n;return n});
if(method==="GET"&&v==="notes"){const n=requireNode(oid);return {...n,html:md(n.body),breadcrumbs:breadcrumbs(n)}}
if(method==="PUT"&&v==="notes")return mod("Update note",()=>{const n=requireNode(oid);n.body=body.body;touch(n);return {...n,html:md(n.body)}});
if(method==="POST"&&p==="/api/rename")return mod("Rename item",()=>{const n=requireNode(body.id);n.title=body.title;return touch(n)});
if(method==="POST"&&p==="/api/move")return mod("Move item",()=>{const n=requireNode(body.id),parent=requireNode(body.parent_id);let up=parent;while(up){if(up.id===n.id)throw Error("Cannot move a folder into itself");up=get(up.parent)}n.parent=parent.id;n.position=body.index===undefined?now():body.index;return touch(n)});
if(method==="POST"&&p==="/api/reorder")return mod("Reorder items",()=>{body.ids.forEach((i,idx)=>{const n=get(i);if(n&&n.parent===body.parent_id){n.position=idx;touch(n)}});return {ok:true}});
if(method==="POST"&&p==="/api/archive")return mod("Archive item",()=>{let n=requireNode(body.id);n.previousParent=n.parent;n.parent="archive";touch(n);return {ok:true}});
if(method==="POST"&&p==="/api/restore")return mod("Restore item",()=>{let n=requireNode(body.id);n.parent=get(n.previousParent)?n.previousParent:"inbox";touch(n);return {ok:true}});
if(method==="GET"&&v==="node")return desc(requireNode(oid));
if(method==="GET"&&p==="/api/graph")return graph();
if(method==="GET"&&v==="concept"){let name=decodeURIComponent(parts.slice(2).join("/"));let mentions=[];for(const n of Object.values(db.records)){if(db.deleted[n.id])continue;let s=(n.body||"")+"\n"+(n.description||"");if(s.toLowerCase().includes("[["+name.toLowerCase()))mentions.push({id:n.id,kind:n.kind,title:n.title,part:n.kind==="note"?"note":"description",place:breadcrumbs(n).slice(0,-1).map(x=>x.title).join(" › "),snippet_html:md(s.slice(0,260))})}return {name,mentions}}
if(method==="GET"&&p==="/api/search"){const q=new URLSearchParams(path.split("?")[1]).get("q")||"";return Object.values(db.records).filter(n=>!db.deleted[n.id]&&words(q).every(w=>(n.title+" "+(n.body||"")+" "+(n.description||"")).toLowerCase().includes(w))).slice(0,30).map(n=>({id:n.id,title:n.title,kind:n.kind,place:breadcrumbs(n).map(x=>x.title).join(" › "),snippet:escap((n.body||n.description||"").slice(0,240))}))}
if(method==="POST"&&p==="/api/render")return {__html:md(body.body)};
if(method==="GET"&&v==="lectures"){const n=requireNode(oid);const generated=n.generated||{},segments=n.segments||[];return {meta:n,chunks:(n.chunks||[]).map(c=>({...c,said:(c.segmentIds||[]).map(i=>segments[i]).filter(Boolean),link:n.panopto_url?(n.panopto_url+(n.panopto_url.includes("?")?"&":"?")+"start="+Math.floor(c.start)):c.link||"",time:Math.floor(c.start/60)+":"+String(Math.floor(c.start%60)).padStart(2,"0")})),pages_not_shown:[],generated,generated_html:Object.fromEntries(Object.entries(generated).map(([k,v])=>[k,md(v)])),my_notes:n.body||"",my_notes_html:md(n.body),has_audio:false,breadcrumbs:breadcrumbs(n)}}
if(method==="POST"&&p==="/api/lectures/from-panopto")return mod("Import Panopto lecture",()=>{const parent=requireNode(body.parent_id||"inbox");if(!["inbox","section","module"].includes(parent.kind))throw Error("Choose a section or the Inbox");if(!Array.isArray(body.segments)||!body.segments.length)throw Error("Transcript is empty");const n={...body,id:id("l"),kind:"lecture",parent:parent.id,created:now(),updated:now(),status:"complete",body:"",title:body.title||"Panopto lecture",source:"panopto-captions"};db.records[n.id]=n;return {id:n.id}})
if(method==="PUT"&&v==="lectures"&&parts[3]==="transcript")return mod("Correct Panopto captions",()=>{const n=requireNode(oid);if(!Array.isArray(body.segments)||!body.segments.length)throw Error("Transcript cannot be empty");n.segments=body.segments;n.chunks=body.chunks||n.chunks;n.generated=body.generated||n.generated;touch(n);return {ok:true}})

if(method==="PUT"&&v==="lectures"&&parts[3]==="notes")return mod("Edit lecture notes",()=>{let n=requireNode(oid);n.body=body.body;touch(n);return {html:md(n.body)}});
if(method==="POST"&&p==="/api/lectures")throw Error("Lecture transcription runs on the Mac version. The browser version supports notes and existing text only.");
throw Error("This feature requires the Mac version: "+method+" "+p);
}
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{const u=typeof input==="string"?input:input.url;let url;try{url=new URL(u,location.href)}catch{return realFetch(input,init)}
if(!url.pathname.startsWith("/api/"))return realFetch(input,init);try{let method=(init.method||"GET").toUpperCase(),b=init.body,parsed=b instanceof FormData?Object.fromEntries(b.entries()):typeof b==="string"?JSON.parse(b):{};const out=request(method,url.pathname+url.search,parsed);return out?.__html!==undefined?new Response(out.__html,{headers:{"Content-Type":"text/html"}}):result(out)}catch(e){return result({detail:e.message||String(e)},400)}};
const bytes=s=>new TextEncoder().encode(s), toB64=b=>btoa(String.fromCharCode(...new Uint8Array(b))),fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(pass,salt){let base=await crypto.subtle.importKey("raw",bytes(pass),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encrypt(obj,pass){let salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));let key=await derive(pass,salt),data=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes(JSON.stringify(obj)));return {v:1,alg:"AES-256-GCM",kdf:"PBKDF2-SHA256",iterations:310000,salt:toB64(salt),iv:toB64(iv),data:toB64(data)}}
async function decrypt(payload,pass){if(payload.v!==1||payload.alg!=="AES-256-GCM")throw Error("Unsupported encrypted data format");let key=await derive(pass,fromB64(payload.salt));return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(payload.iv)},key,fromB64(payload.data))))}
const encode64=s=>btoa(unescape(encodeURIComponent(s))),decode64=s=>decodeURIComponent(escape(atob(s.replace(/\s/g,""))));

/* Cross-device sync. GitHub is the canonical encrypted copy while browser storage
   remains usable offline. Each browser tracks the last confirmed record versions,
   so concurrent edits to one item are preserved as conflict copies. */
const AUTH_KEY="lumen.cloud.auth.v1", SESSION_KEY="lumen.cloud.session", BASELINE_KEY="lumen.cloud.synced.v2";
const fingerprint=obj=>{const str=JSON.stringify(obj),a=16777619;let h=2166136261,j=2246822519;
 for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);h=Math.imul(h^c,a);j=Math.imul(j+c,1597334677)}
 return (h>>>0).toString(16).padStart(8,"0")+(j>>>0).toString(16).padStart(8,"0")};
const fingerprints=data=>Object.fromEntries(Object.entries(data.records||{}).map(([id,r])=>[id,fingerprint(r)]));
let baseline=load(BASELINE_KEY,null);
let auth=load(AUTH_KEY,null)||load(SESSION_KEY,null);
if(auth&&(!cfg||auth.owner!==cfg.owner||auth.repo!==cfg.repo))auth=null;
let token=auth?.token||"",passphrase=auth?.passphrase||"",pending=false,dirtyVersion=0,syncTimer=null,lastSyncState="offline",lastSyncMessage="Not connected";
const credentials=()=>Boolean(cfg&&token&&passphrase);
const validCfg=c=>c&&/^[a-zA-Z0-9-]{1,39}$/.test(c.owner)&&/^[a-zA-Z0-9._-]{1,100}$/.test(c.repo);
function updateIndicator(){
 const b=document.querySelector("#lumen-sync-settings");
 if(b){b.dataset.sync=lastSyncState;b.title="Settings · "+lastSyncMessage;b.setAttribute("aria-label","Settings · "+lastSyncMessage)}
 const line=document.querySelector("#lumen-sync-status-detail");
 if(line){line.textContent=lastSyncMessage;line.dataset.sync=lastSyncState}
}
function status(state,message){lastSyncState=state;lastSyncMessage=message;lastError=state==="error"?message:"";updateIndicator()}
const headers=()=>({Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"});
const endpoint=()=>("https://api.github.com/repos/"+encodeURIComponent(cfg.owner)+"/"+encodeURIComponent(cfg.repo)+"/contents/lumen-vault.enc.json");
const repoEndpoint=()=>("https://api.github.com/repos/"+encodeURIComponent(cfg.owner)+"/"+encodeURIComponent(cfg.repo));
function recordHistory(message){history.push({date:new Date().toISOString(),message,db:copy(db)});if(history.length>30)history.shift();try{localStorage.setItem(HISTORY,JSON.stringify(history))}catch{}}
function persistBaseline(sent){baseline={owner:cfg.owner,repo:cfg.repo,records:fingerprints(sent)};try{localStorage.setItem(BASELINE_KEY,JSON.stringify(baseline))}catch(e){console.warn("Could not store Lumen sync checkpoint",e)}}
function baselineRecords(){return baseline&&cfg&&baseline.owner===cfg.owner&&baseline.repo===cfg.repo?baseline.records||{}:{}}
function mergeStates(local,remote){
 const out=copy(local),old=baselineRecords();
 out.records||={};out.deleted||={};
 for(const [key,t] of Object.entries(remote.deleted||{}))out.deleted[key]=Math.max(out.deleted[key]||0,t);
 for(const [key,r] of Object.entries(remote.records||{})){
  const existing=out.records[key];
  if(["root","inbox","archive"].includes(key)){out.records[key]=copy(r);continue}
  if(!existing){out.records[key]=copy(r);continue}
  const current=fingerprint(existing),incoming=fingerprint(r),previous=old[key];
  if(current===incoming)continue;
  if(previous&&current===previous){out.records[key]=copy(r);continue}
  if(previous&&incoming===previous)continue;
  // Both versions changed since the last confirmed sync: preserve both.
  // Derive a stable copy ID to avoid creating repeated duplicates on retries.
  const conflictId="conflict_"+key+"_"+incoming;
  if(!out.records[conflictId]){
   const duplicate=copy(r);
   duplicate.id=conflictId;
   duplicate.title=(r.title||"Untitled")+" (conflict copy)";
   duplicate.updated=now();
   out.records[conflictId]=duplicate;
  }
 }
 for(const [key,t] of Object.entries(out.deleted)){if(out.records[key]&&Number(out.records[key].updated||0)<=Number(t))delete out.records[key]}
 return out;
}
function saveMerged(merged){
 if(JSON.stringify(merged)===JSON.stringify(db))return;
 db=merged;localStorage.setItem(DATA,JSON.stringify(db));
 window.dispatchEvent(new Event("lumen-remote-updated"));
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function queueSync(delay=900){pending=true;dirtyVersion++;clearTimeout(syncTimer);if(!credentials())return;status("pending","Saved locally · syncing soon");syncTimer=setTimeout(()=>sync(),delay)}
async function sync(){
 if(!credentials()){status("disconnected",cfg?"Unlock sync in Settings":"Connect GitHub in Settings");return false}
 if(!navigator.onLine){status("offline","Saved on this device · waiting for internet");return false}
 if(busy){pending=true;return false}
 busy=true;clearTimeout(syncTimer);status("syncing","Syncing with GitHub…");
 let ok=false,changedDuring=false;
 try{
  for(let attempt=0;attempt<5;attempt++){
   const response=await realFetch(endpoint(),{headers:headers(),cache:"no-store"});
   if(!response.ok&&response.status!==404)throw Error("GitHub download failed (HTTP "+response.status+")");
   const file=response.status===404?null:await response.json();
   if(file&&(!file.content||file.size>950000))throw Error("GitHub vault is too large for one sync file. Export a backup.");
   let remote=file?await decrypt(JSON.parse(decode64(file.content)),passphrase):base();
   if(!remote||typeof remote.records!=="object")throw Error("Unsupported GitHub vault format");
   const merged=mergeStates(db,remote);
   saveMerged(merged);
   const sent=copy(db),writeAtVersion=dirtyVersion;
   if(file&&JSON.stringify(remote)===JSON.stringify(sent)){
    persistBaseline(sent);changedDuring=dirtyVersion!==writeAtVersion;ok=true;break;
   }
   const upload=await encrypt(sent,passphrase);
   const put=await realFetch(endpoint(),{method:"PUT",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({message:"Sync Lumen encrypted vault",content:encode64(JSON.stringify(upload)),...(file?{sha:file.sha}:{})})});
   if(put.status===409||put.status===422){await sleep(240+Math.random()*300);continue}
   if(!put.ok)throw Error("GitHub upload failed (HTTP "+put.status+")");
   persistBaseline(sent);changedDuring=dirtyVersion!==writeAtVersion;ok=true;break;
  }
  if(!ok)throw Error("Too many simultaneous updates. Lumen will retry.");
  pending=changedDuring;
  lastSuccess=now();status("synced","Synced · "+new Date().toLocaleTimeString());
  return true;
 }catch(e){
  status("error",e.message||"Couldn't synchronize. Your changes remain saved here.");
  pending=true;return false;
 }finally{
  busy=false;
  if(pending&&ok)syncTimer=setTimeout(()=>sync(),600);
 }
}
window.addEventListener("online",()=>sync());
window.addEventListener("focus",()=>sync());
document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
window.addEventListener("storage",ev=>{
 if(ev.key===DATA&&ev.newValue){try{const incoming=JSON.parse(ev.newValue);if(incoming?.records){const merged=mergeStates(db,incoming);if(JSON.stringify(merged)!==JSON.stringify(db)){db=merged;window.dispatchEvent(new Event("lumen-remote-updated"));queueSync(500)}}}catch(e){console.warn("Could not reconcile Lumen browser tabs",e)}}
});
setInterval(()=>{if(!document.hidden&&credentials())sync()},15000);
const st=document.createElement("style");st.textContent=`#lumen-sync-bar{position:fixed;bottom:12px;right:15px;z-index:9000;display:flex;align-items:center;gap:10px;padding:8px 12px;background:#20212a;color:#eee;border:1px solid #454654;border-radius:12px;box-shadow:0 8px 30px #0005;font:12px system-ui}#lumen-sync-bar button{color:#b8d3ff;border:1px solid #576276;border-radius:7px;padding:5px 8px;cursor:pointer}#lumen-cloud-modal{position:fixed;inset:0;z-index:9001;background:#000b;display:grid;place-items:center;padding:15px}#lumen-cloud-modal .panel{width:min(500px,100%);max-height:95vh;overflow:auto;background:#1e2028;color:#f1f1f1;border:1px solid #535563;border-radius:18px;padding:22px;font:14px/1.6 system-ui}#lumen-cloud-modal input{display:block;width:100%;margin:4px 0 12px;background:#101219;border:1px solid #515768;border-radius:8px;color:white;padding:10px}#lumen-cloud-modal button{background:#a4c5ff;color:#161923;padding:9px 13px;border-radius:9px;margin-right:6px;margin-bottom:8px;cursor:pointer}#lumen-cloud-modal a{color:#a4c5ff}`;document.head.append(st);
function settings(){document.querySelector("#lumen-cloud-modal")?.remove();let modal=document.createElement("div");modal.id="lumen-cloud-modal";modal.innerHTML=`<div class="panel"><h2>Lumen sync</h2><p>Your notes are saved in this browser immediately. To sync across devices, create a <b>separate private GitHub repository</b> and a fine-grained access token restricted to that repository with <b>Contents: Read and write</b>. The app encrypts your data before uploading.</p><p><a href="https://github.com/new" target="_blank" rel="noopener">Create private repository</a> · <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create token</a></p><form id="lumen-cloud-form"><label>GitHub account/owner<input name="owner" required placeholder="github-username" value="${escap(cfg?.owner||"")}"></label><label>Private data repository name<input name="repo" required placeholder="lumen-private-data" value="${escap(cfg?.repo||"")}"></label><label>Fine-grained access token<input type="password" name="token" required autocomplete="off" placeholder="github_pat_…"></label><label>Encryption password (choose a strong, unique phrase)<input type="password" name="pass" required minlength="12" autocomplete="off" placeholder="At least 12 characters"></label><p style="font-size:12px;opacity:.85">Keep both secrets safe. The encryption password cannot be recovered. Secrets stay only in memory until this tab is closed, so you will re-enter them when opening the site on a new session. Never paste them into chat or commit them to your code.</p><button type="submit">Connect and sync</button><button type="button" id="lumen-close">Close</button><button type="button" id="lumen-export">Export backup</button><button type="button" id="lumen-import">Import backup</button><input type="file" id="lumen-import-file" accept=".json" hidden></form><p id="lumen-form-error" role="alert"></p></div>`;document.body.append(modal);
modal.querySelector("#lumen-close").onclick=()=>modal.remove();modal.querySelector("#lumen-export").onclick=()=>{let a=document.createElement("a"),blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});a.href=URL.createObjectURL(blob);a.download="lumen-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
modal.querySelector("#lumen-import").onclick=()=>modal.querySelector("#lumen-import-file").click();modal.querySelector("#lumen-import-file").onchange=async e=>{try{let data=JSON.parse(await e.target.files[0].text());if(!data.records||!data.deleted)throw Error("Unsupported backup");if(confirm("Merge this backup into your existing notes?")){snapshot("Import backup");db=merge(db,data);save();location.reload()}}catch(err){modal.querySelector("#lumen-form-error").textContent=err.message}};
modal.querySelector("form").onsubmit=async e=>{e.preventDefault();let f=new FormData(e.currentTarget);cfg={owner:String(f.get("owner")).trim(),repo:String(f.get("repo")).trim()};token=String(f.get("token")).trim();passphrase=String(f.get("pass"));localStorage.setItem(CFG,JSON.stringify(cfg));sessionStorage.setItem("lumen.cloud.session",JSON.stringify({token,passphrase}));modal.querySelector("#lumen-form-error").textContent="Connecting…";try{let r=await realFetch(endpoint(),{headers:headers()});if(!r.ok&&r.status!==404)throw Error("Cannot access repository ("+r.status+"). Check owner, token and Contents permission.");if(r.ok){const file=await r.json();await decrypt(JSON.parse(decode64(file.content)),passphrase)}modal.remove();await sync();if(!lastError)window.dispatchEvent(new Event("hashchange"))}catch(err){token="";passphrase="";sessionStorage.removeItem("lumen.cloud.session");modal.querySelector("#lumen-form-error").textContent=err.message==="The operation failed for an operation-specific reason"?"Incorrect encryption password":err.message}};
}
const bar=document.createElement("div");bar.id="lumen-sync-bar";bar.innerHTML='<span id="lumen-sync-status">Saved on this device</span><button id="lumen-sync-now" aria-label="Sync now">↻</button><button id="lumen-sync-settings">Sync settings</button>';document.body.append(bar);
bar.querySelector("#lumen-sync-settings").onclick=settings;bar.querySelector("#lumen-sync-now").onclick=()=>cfg&&token?sync():settings();
window.LumenCloud={settings,sync,exportData:()=>copy(db)};
if(!cfg)setTimeout(()=>status("Offline · set up sync"),0);else if(token&&passphrase){status("Connected · checking for updates");setTimeout(sync,800)}else status("Saved locally · unlock sync");
})();