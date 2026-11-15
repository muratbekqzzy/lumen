const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('web/graph.js', 'utf8').replace(/^import .*;\n/m, '').replace('export function mountGraph', 'function mountGraph');

function target() {
 const events = new Map();
 return {events, addEventListener(n, fn) { if (!events.has(n)) events.set(n, new Set()); events.get(n).add(fn); }, removeEventListener(n, fn) { events.get(n)?.delete(fn); },
 dispatch(n, props = {}) { for (const fn of [...events.get(n) || []]) fn({type:n, preventDefault(){}, ...props}); }};
}
function fixture({empty = false, theme = 'space', motion = 'full', width = 800, height = 650, data:customData} = {}) {
 const calls = [], frames = new Map(), observers = [], simulations = [], canvases = [];
 let timestamp = 0, serial = 0;
 const drawing = new Proxy({createRadialGradient:() => ({addColorStop(){}})}, {
  get(obj, key) { return key in obj ? obj[key] : (...args) => { calls.push({method:key, args}); }; },
  set(obj, key, value) { calls.push({property:key,value}); obj[key] = value; return true; }
 });
 const document = {...target(),hidden:false,documentElement:{dataset:{theme,motion}},createElement(name){
  assert.equal(name,'canvas');const canvas={...target(),style:{},width:0,height:0,removed:false,setAttribute(){},focus(){},setPointerCapture(){},remove(){this.removed=true;},getContext:()=>drawing};canvases.push(canvas);return canvas;
 }};
 const window=target(),media={...target(),matches:false},host={width,height,append(c){this.canvas=c;},getBoundingClientRect(){return {width:this.width,height:this.height};}};
 const chain=()=>({strength(){return this},distanceMax(){return this},radius(){return this},id(){return this},distance(){return this}});
 const forceLink=links=>({...chain(), links});
 function forceSimulation(nodes){
  const sim={nodes,events:new Map(),stopped:false,restarts:0,target:0,
   force(name,force){if(name==='link')for(const edge of force.links){edge.source=nodes.find(n=>n.id===edge.source);edge.target=nodes.find(n=>n.id===edge.target);}return this},
   alphaDecay(){return this},velocityDecay(){return this},alpha(){return .001},alphaTarget(n){this.target=n;return this},restart(){this.stopped=false;this.restarts++;return this},stop(){this.stopped=true;return this},
   on(name,fn){if(fn===null)this.events.delete(name);else this.events.set(name,fn);return this}};
  simulations.push(sim);return sim;
 }
 const context={document,window,matchMedia:()=>media,ResizeObserver:class{constructor(fn){this.fn=fn;this.disconnected=false;observers.push(this);}observe(){this.fn();}disconnect(){this.disconnected=true;}},
  requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},cancelAnimationFrame(id){frames.delete(id);},performance:{now:()=>timestamp},devicePixelRatio:2,forceSimulation,forceLink,
  forceManyBody:chain,forceCollide:chain,forceX:chain,forceY:chain,console};
 vm.createContext(context);vm.runInContext(source,context);
 const data=customData||(empty?{nodes:[],edges:[]}:{nodes:[{id:'s1',title:'Dreams',kind:'section',section:'s1',color:'#c4b5fd'},{id:'n1',title:'Memory',kind:'note',section:'s1',parent:'s1',degree:1}],edges:[{source:'s1',target:'n1',type:'contains'}]});
 let selects=0,opens=0;
 const graph=context.mountGraph(host,data,{onSelect(){selects++;},onOpen(){opens++;}});
 function advance(count=1){for(let i=0;i<count;i++){timestamp+=40;const queue=[...frames.values()];frames.clear();for(const fn of queue)fn(timestamp);}}
 return {graph,host,document,window,media,canvas:host.canvas,calls,frames,observers,sim:simulations[0],advance,get selects(){return selects},get opens(){return opens}};
}
function point(type,id,x,y){return {pointerId:id,offsetX:x,offsetY:y,pointerType:type,button:0};}

test('the universe labels landmarks rather than every note, and reveals a selected star clearly',()=>{
 const f=fixture({motion:'calm'});f.advance(3);assert(!f.calls.some(c=>c.method==='fillText'&&c.args[0]==='Memory'));f.calls.length=0;f.graph.focus('n1');f.advance(2);assert(f.calls.some(c=>c.method==='fillText'&&c.args[0]==='Memory'));f.graph.destroy();
});
test('dense universes cap visible labels on desktop and mobile',()=>{
 const data={nodes:Array.from({length:24},(_,i)=>({id:'s'+i,kind:'section',title:'Section '+i,section:'s'+i})),edges:[]};
 for(const width of [800,360]){const f=fixture({data,width,motion:'calm'});f.advance(3);f.calls.length=0;f.graph.setQuery('Section');f.advance();assert(f.calls.filter(c=>c.method==='fillText').length<=(width<600?3:5));f.graph.destroy();}
});

test('graph destruction removes preference, input, observer and animation resources',()=>{
 const f=fixture();f.advance(35);assert(f.calls.some(x=>x.method==='fillText'));
 f.graph.destroy();f.graph.destroy();assert.equal(f.frames.size,0);assert.equal(f.sim.stopped,true);assert(f.observers[0].disconnected);assert(f.canvas.removed);
 for(const eventTarget of [f.canvas,f.window,f.document,f.media])for(const callbacks of eventTarget.events.values())assert.equal(callbacks.size,0);
});
test('empty libraries show decorative particles without inventing graph records',()=>{
 const f=fixture({empty:true});f.advance(2);assert.equal(f.sim.nodes.length,0);assert(f.calls.filter(x=>x.method==='fillRect').length>500);assert(!f.calls.some(x=>x.method==='fillText'));f.graph.destroy();
});
test('theme changes redraw dark labels for sky and bright labels for space',()=>{
 const f=fixture({motion:'calm'});f.advance(3);f.graph.focus('n1');f.advance();f.calls.length=0;
 f.document.documentElement.dataset.theme='sky';f.window.dispatch('lumen-theme-changed');f.advance();
 assert(f.calls.some(x=>x.property==='fillStyle'&&x.value==='rgba(61,49,94,0.9)'));
 f.calls.length=0;f.document.documentElement.dataset.theme='space';f.window.dispatch('lumen-theme-changed');f.advance();
 assert(f.calls.some(x=>x.property==='fillStyle'&&x.value==='rgba(242,237,255,0.9)'));f.graph.destroy();
});
test('pointer cancellation never opens or selects a star',()=>{
 const f=fixture({motion:'calm'});f.advance(3);
 f.canvas.dispatch('pointerdown',point('touch',1,400,325));f.canvas.dispatch('pointercancel',point('touch',1,400,325));assert.equal(f.selects,0);assert.equal(f.opens,0);assert.equal(f.sim.target,0);f.graph.destroy();
});
test('pinch movement pans around its moving midpoint and cannot become a tap',()=>{
 const f=fixture({motion:'calm'});f.advance(3);
 f.canvas.dispatch('pointerdown',point('touch',1,200,300));f.canvas.dispatch('pointerdown',point('touch',2,400,300));
 f.canvas.dispatch('pointermove',point('touch',1,250,300));f.canvas.dispatch('pointermove',point('touch',2,450,300));f.advance();
 const transforms=f.calls.filter(x=>x.method==='translate');assert(transforms.some(x=>x.args[0]>400),'moving pinch midpoint moves the view');
 f.canvas.dispatch('pointerup',point('touch',1,250,300));f.canvas.dispatch('pointerup',point('touch',2,450,300));assert.equal(f.selects,0);assert.equal(f.opens,0);f.graph.destroy();
});
test('hidden documents pause the simulation and resume without leaking an animation',()=>{
 const f=fixture();f.advance();f.document.hidden=true;f.document.dispatch('visibilitychange');assert.equal(f.frames.size,0);assert.equal(f.sim.stopped,true);
 f.document.hidden=false;f.document.dispatch('visibilitychange');assert.equal(f.frames.size,1);f.advance();assert.equal(f.frames.size,1);f.graph.destroy();
});
test('zero-sized hosts can resize to a short mobile viewport with finite fitting',()=>{
 const f=fixture({width:0,height:0,motion:'calm'});f.advance();assert.equal(f.frames.size,0);
 f.host.width=320;f.host.height=250;f.observers[0].fn();f.graph.fit();f.advance(3);
 for(const call of f.calls.filter(x=>['translate','scale','setTransform'].includes(x.method)))assert(call.args.every(Number.isFinite));
 const scale=f.calls.filter(x=>x.method==='scale').at(-1);assert(scale.args[0]>.08,'mobile fit leaves usable space instead of negative dimensions');f.graph.destroy();
});
test('system motion preferences override ambient drift and wake a static view on changes',()=>{
 const f=fixture({motion:'calm'});f.advance(3);assert.equal(f.frames.size,0);
 f.document.documentElement.dataset.motion='full';f.window.dispatch('lumen-motion-changed');f.advance();assert.equal(f.frames.size,1);
 f.media.matches=true;f.media.dispatch('change');f.advance(3);assert.equal(f.frames.size,0);f.graph.destroy();
});
test('one selected-star tap opens once; a synthetic double-click does not open it again',()=>{
 const f=fixture({motion:'calm'});f.advance(3);f.graph.focus('n1');f.advance();
 // Focusing centers this star; static mode makes its rendered position exact.
 f.canvas.dispatch('pointerdown',point('mouse',1,400,325));f.canvas.dispatch('pointerup',point('mouse',1,400,325));f.canvas.dispatch('dblclick',point('mouse',1,400,325));assert.equal(f.opens,1);f.graph.destroy();
});
