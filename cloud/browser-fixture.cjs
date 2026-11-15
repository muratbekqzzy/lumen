const vm=require("node:vm");
const fs=require("node:fs");
const {webcrypto}=require("node:crypto");
const code=fs.readFileSync("cloud/cloud.js","utf8");
function browser(options={}){
 const saved=options.saved||new Map(),session=options.session||new Map(),hooks={},timers=new Map();let timerId=0;
 const localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
 const fakeElement=()=>({style:{},innerHTML:"",onclick:null,append(){},remove(){},querySelector(){return fakeElement()},addEventListener(){}});
 const document={head:{append(){}},body:{append(){}},activeElement:{matches:()=>false},createElement:fakeElement,querySelector(){return null},addEventListener(n,cb){hooks[n]=cb},hidden:false};
 const online={onLine:true};
 const window={LUMEN_HOSTED:options.hosted===true,fetch:options.fetch||(async()=>new Response("",{status:404})),addEventListener(n,fn){hooks[n]=fn},dispatchEvent(){},location:{href:"https://example.github.io/lumen/"},navigator:online};
 const context={window,document,localStorage,sessionStorage,crypto:webcrypto,TextEncoder,TextDecoder,Response,URL,URLSearchParams,FormData,AbortController,
    Event, navigator:online,location:{href:"https://example.github.io/lumen/",pathname:"/lumen/",search:"",hash:""},setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)},setInterval(){},console,confirm:()=>true,alert:()=>{},btoa,atob};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync("web/markdown.js","utf8"),context);
 vm.runInContext(code,context,{filename:"cloud/cloud.js"});
 vm.runInContext(fs.readFileSync("cloud/panopto.js","utf8"),context,{filename:"cloud/panopto.js"});
 return {window,localStorage,sessionStorage,hooks,online,timers,saved,context};
}
async function api(browser,method,path,body){
 const r=await browser.window.fetch("https://example.github.io"+path,{method,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();
 if(!r.ok)throw Error(data.detail);
 return JSON.parse(JSON.stringify(data));
}

module.exports={browser,api};
