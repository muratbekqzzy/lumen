const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const {webcrypto}=require("node:crypto");
const code=fs.readFileSync("cloud/cloud.js","utf8");
function browser(){
 const saved=new Map(),session=new Map(),hooks={};
 const localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
 const fakeElement=()=>({style:{},innerHTML:"",onclick:null,append(){},remove(){},querySelector(){return fakeElement()},addEventListener(){}});
 const document={head:{append(){}},body:{append(){}},activeElement:{matches:()=>false},createElement:fakeElement,querySelector(){return null},addEventListener(n,cb){hooks[n]=cb},hidden:false};
 const window={fetch:async()=>new Response("",{status:404}),addEventListener(){},dispatchEvent(){},location:{href:"https://example.github.io/lumen/"},navigator:{onLine:true}};
 const context={window,document,localStorage,sessionStorage,crypto:webcrypto,TextEncoder,TextDecoder,Response,URL,URLSearchParams,FormData,AbortController,
    Event, navigator:{onLine:true},location:{href:"https://example.github.io/lumen/"},setTimeout:()=>0,clearTimeout(){},setInterval(){},console,confirm:()=>true,alert:()=>{},btoa,atob};
 vm.createContext(context);
 vm.runInContext(code,context,{filename:"cloud/cloud.js"});
 return {window,localStorage};
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
