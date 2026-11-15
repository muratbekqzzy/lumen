const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const geometry=()=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('web/universe.js','utf8')).toString('base64'));
const nodes=(children=0)=>[{id:'a',kind:'section',galaxy:'a'},{id:'b',kind:'section',galaxy:'b'},...Array.from({length:children},(_,i)=>({id:'lecture'+i,kind:'lecture',galaxy:'a'}))];
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
