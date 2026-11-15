const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('web/aura.js', 'utf8');
function fixture({theme='space',motion='full',reduced=false,hash='#/'}={}) {
 const windowEvents = {}, documentEvents = {}, mediaEvents = {}, classes = new Set();
 const atmosphere = {className:'',setAttribute(name,value){this[name]=value},classList:{toggle(name,on){on?classes.add(name):classes.delete(name)}}};
 const meta = {setAttribute(name,value){this[name]=value}};
 const body = {dataset:{},prepend(element){this.firstChild=element}};
 const document = {body,hidden:false,documentElement:{dataset:{theme,motion}},createElement:()=>atmosphere,querySelector:()=>meta,addEventListener:(n,fn)=>documentEvents[n]=fn};
 const media = {matches:reduced,addEventListener:(n,fn)=>mediaEvents[n]=fn};
 const context = {document,location:{hash},window:{addEventListener:(n,fn)=>windowEvents[n]=fn},matchMedia:()=>media};
 vm.runInNewContext(source, context);
 return {document,body,meta,classes,media,windowEvents,documentEvents,mediaEvents,atmosphere};
}
test('decorative atmosphere follows theme and stays outside the interactive app',()=>{
 const f=fixture();assert.equal(f.body.firstChild,f.atmosphere);assert.equal(f.atmosphere['aria-hidden'],'true');assert.equal(f.meta.content,'#121126');
 f.document.documentElement.dataset.theme='sky';f.windowEvents['lumen-theme-changed']();assert.equal(f.meta.content,'#f3eef8');
 assert.equal(f.body.dataset.scene,'universe');
 f.document.documentElement.dataset.view='reading';f.windowEvents['lumen-scene-changed']();assert.equal(f.body.dataset.scene,'reading');
});
test('ambient animation pauses for calm mode, reduced motion, and hidden tabs',()=>{
 const f=fixture();assert(!f.classes.has('aura-still'));
 f.document.hidden=true;f.documentEvents.visibilitychange();assert(f.classes.has('aura-still'));
 f.document.hidden=false;f.documentEvents.visibilitychange();assert(!f.classes.has('aura-still'));
 f.document.documentElement.dataset.motion='calm';f.windowEvents['lumen-motion-changed']();assert(f.classes.has('aura-still'));
 f.document.documentElement.dataset.motion='full';f.media.matches=true;f.mediaEvents.change();assert(f.classes.has('aura-still'));
});
test('the sky is built from seeded, fixed sparkles and survives a device without WebGL',()=>{
 const a=fixture(),b=fixture();assert.equal(a.atmosphere.innerHTML,b.atmosphere.innerHTML);
 assert.match(a.atmosphere.innerHTML,/class="aura-flow"/);assert.equal((a.atmosphere.innerHTML.match(/--s:/g)||[]).length,34);
 assert(!a.atmosphere.innerHTML.includes('aura-rain'));assert(!a.atmosphere.innerHTML.includes('--h:'));assert(!a.classes.has('aura-gl'));
});

function flowFixture({compile=true,motion='full'}={}){
 const frames=new Map(),calls=[],classes=new Set(),events={},canvasEvents={};let serial=0,time=0;
 const gl=new Proxy({COMPILE_STATUS:1,LINK_STATUS:2,VERTEX_SHADER:3,FRAGMENT_SHADER:4,
  getShaderParameter:()=>compile,getProgramParameter:()=>true,createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getAttribLocation:()=>0,getUniformLocation:(_program,name)=>name},
  {get:(obj,key)=>key in obj?obj[key]:(...args)=>calls.push({method:key,args})});
 const canvas={width:0,height:0,getContext:()=>gl,getBoundingClientRect:()=>({width:390,height:844}),addEventListener:(name,fn)=>canvasEvents[name]=fn};
 const atmosphere={classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)},setAttribute(){},querySelector:()=>canvas};
 const document={hidden:false,body:{dataset:{},prepend(){}},documentElement:{dataset:{theme:'space',motion}},createElement:()=>atmosphere,querySelector:()=>({setAttribute(){}}),addEventListener:(name,fn)=>events['document:'+name]=fn};
 const ctx={document,location:{hash:'#/'},devicePixelRatio:3,innerWidth:390,innerHeight:844,window:{addEventListener:(name,fn)=>events[name]=fn},matchMedia:query=>({matches:query==='(pointer: fine)',addEventListener(){}}),
  requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.runInNewContext(source,ctx);
 return {document,frames,calls,classes,canvas,events,canvasEvents,advance(count=1,step=16){for(let i=0;i<count;i++){time+=step;const queue=[...frames.values()];frames.clear();queue.forEach(fn=>fn(time));}}};
}
test('flow paints before replacing its fallback, adapts to slow frames, and recovers from context loss',()=>{
 const f=flowFixture();assert(!f.classes.has('aura-gl'));f.advance();assert(f.classes.has('aura-gl'));
 assert(f.canvas.width>=390);assert(f.canvas.width*f.canvas.height<=701000);const before=f.canvas.width;
 f.advance(8,60);assert(f.canvas.width<before,'Sustained missed frames reduce background cost');
 let prevented=false;f.canvasEvents.webglcontextlost({preventDefault(){prevented=true;}});assert(prevented);assert(!f.classes.has('aura-gl'));assert.equal(f.frames.size,0);
 f.canvasEvents.webglcontextrestored();assert(!f.classes.has('aura-gl'));f.advance();assert(f.classes.has('aura-gl'));
});
test('hidden flow schedules no frames, and calm mode renders a still theme without a fade loop',()=>{
 const f=flowFixture();f.advance(3);f.document.hidden=true;f.events['document:visibilitychange']();assert.equal(f.frames.size,0);
 const clock=f.calls.filter(x=>x.method==='uniform1f'&&x.args[0]==='uTime').at(-1).args[1];f.advance(1,60000);
 f.document.hidden=false;f.events['document:visibilitychange']();f.advance();const resumed=f.calls.filter(x=>x.method==='uniform1f'&&x.args[0]==='uTime').at(-1).args[1];assert(resumed-clock<.1);
 const still=flowFixture({motion:'calm'});still.advance();assert.equal(still.frames.size,0);still.document.documentElement.dataset.theme='sky';still.events['lumen-theme-changed']();still.advance();assert.equal(still.frames.size,0);
 assert.equal(still.calls.filter(x=>x.method==='uniform1f'&&x.args[0]==='uSky').at(-1).args[1],1);
});
test('shader compilation failure retains the gradient sky and releases failed shaders',()=>{
 const f=flowFixture({compile:false});assert.equal(f.frames.size,0);assert(!f.classes.has('aura-gl'));assert.equal(f.calls.filter(x=>x.method==='deleteShader').length,2);
});
