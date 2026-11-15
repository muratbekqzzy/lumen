const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const geometry=()=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('web/universe.js','utf8')).toString('base64'));
const nodes=(children=0)=>[{id:'a',kind:'section',galaxy:'a'},{id:'b',kind:'section',galaxy:'b'},...Array.from({length:children},(_,i)=>({id:'lecture'+i,kind:'lecture',galaxy:'a'}))];
test('camera easing covers the same distance at 30, 60 and 120 frames per second',async()=>{
 const {motionResponse,seededRandom}=await geometry(),positions=[];
 for(const fps of [30,60,120]){let x=0;for(let i=0;i<fps;i++)x+=(1-x)*motionResponse(1000/fps);positions.push(x);}
 assert(Math.max(...positions)-Math.min(...positions)<1e-12);assert.equal(motionResponse(0),0);
 const a=seededRandom('dust'),b=seededRandom('dust');for(let i=0;i<100;i++)assert.equal(a(),b());
});
test('small sections begin together and spread naturally as their contents grow',async()=>{
 const {galaxyLayout}=await geometry(),small=[...galaxyLayout(nodes()).values()],large=[...galaxyLayout(nodes(50)).values()];
 const distance=list=>Math.hypot(list[0].ax-list[1].ax,list[0].ay-list[1].ay);
 assert(distance(small)>70&&distance(small)<140);assert(distance(large)>distance(small)*2);assert(Math.abs(small[0].ay-small[1].ay)<20);
 assert.equal(small[0].ax+small[1].ax,0);assert(large[0].footprint>small[0].footprint);
});
test('the whole composition stays central on phone, tablet and desktop viewports',async()=>{
 const {galaxyLayout,overviewCamera,screenPoint}=await geometry(),galaxies=[...galaxyLayout(nodes(5)).values()],points=galaxies.map(g=>({x:g.ax,y:g.ay,r:g.footprint}));
 for(const [width,height] of [[390,844],[768,1024],[1280,800],[844,390]]){
  const camera=overviewCamera(points,width,height),positions=points.map(point=>screenPoint(point,camera,width,height));
  for(const p of positions){assert(p.x>width*.15&&p.x<width*.85);assert(p.y>height*.18&&p.y<height*.82);}
  const center=positions.reduce((sum,p)=>sum+p.x,0)/positions.length;assert(Math.abs(center-width/2)<width*.1);
 }
});
test('rotated and magnified views preserve reversible coordinates for precise touch picking',async()=>{
 const {screenPoint,worldPoint,overviewCamera}=await geometry();
 for(const angle of [0,Math.PI/2,-Math.PI/3,Math.PI*4+.3])for(const k of [.2,1,4]){
  const camera={x:28,y:-19,k,angle},original={x:54,y:-32},screen=screenPoint(original,camera,390,844),restored=worldPoint(screen,camera,390,844);
  assert(Math.abs(original.x-restored.x)<1e-9&&Math.abs(original.y-restored.y)<1e-9);
  const fit=overviewCamera([{x:100,y:20,r:40},{x:-70,y:-10,r:20}],390,844,{angle});assert(Object.values(fit).every(Number.isFinite));
 }
});
test('layout and camera fitting are read-only, including empty or temporarily hidden views',async()=>{
 const {galaxyLayout,overviewCamera}=await geometry(),data=nodes(5);const before=JSON.stringify(data);galaxyLayout(data);assert.equal(JSON.stringify(data),before);
 for(const [width,height] of [[0,0],[320,250]])assert(Object.values(overviewCamera([],width,height)).every(Number.isFinite));
});
test('texture resolution follows pixel demand and the canvas respects a bounded retina budget',async()=>{
 const {canvasPixelRatio,textureResolution}=await geometry();
 assert.equal(canvasPixelRatio(390,844,3),3);assert.equal(canvasPixelRatio(1440,900,2),2);
 const ratio=canvasPixelRatio(3840,2160,3);assert(ratio>=1&&ratio<2);assert(3840*2160*ratio*ratio<=14000001);
 assert.equal(textureResolution(320),512);assert.equal(textureResolution(900),1024);assert.equal(textureResolution(1700),2048);assert.equal(textureResolution(10000),2048);
});
test('zooming keeps star cores and selected halos small in screen pixels',async()=>{
 const {starAppearance}=await geometry();
 for(const kind of ['section','module','note','concept'])for(const zoom of [.04,.2,1,3,6])for(const selected of [false,true]){
  const light=starAppearance(kind,8,zoom,selected);
  assert(light.corePx>=.8&&light.corePx<=2.2);assert(light.haloPx>light.corePx&&light.haloPx<=30);assert(light.haloOpacity<=.85);
 }
});
