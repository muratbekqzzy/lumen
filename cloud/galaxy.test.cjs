const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('web/universe.js','utf8').replace(/export /g,'')+'\n'+fs.readFileSync('web/galaxy.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function atlasFixture(options={}){
 const tasks=new Map(),generated=[],warnings=[];let serial=0,ready=0;
 const ctx={console:{warn:message=>warnings.push(message)}};vm.createContext(ctx);vm.runInContext(code,ctx);
 const atlas=ctx.createGalaxyAtlas({generate(sky,variant,resolution){generated.push({sky,variant,resolution});if(options.fail&&resolution>512)throw Error('Texture allocation failed');return {width:resolution,height:resolution};},
  onReady(){ready++;},schedule(fn){tasks.set(++serial,fn);return serial;},cancel(id){tasks.delete(id);},...options});
 return {atlas,tasks,generated,warnings,get ready(){return ready;},flush(){const [id,fn]=tasks.entries().next().value;tasks.delete(id);fn();}};
}
test('galaxy details appear immediately and refine once between interactions',()=>{
 const f=atlasFixture(),base=f.atlas.get(false,0,900);assert.equal(base.width,512);assert.equal(f.generated.length,1);
 for(let i=0;i<12;i++)assert.equal(f.atlas.get(false,0,900),base);assert.equal(f.tasks.size,1);
 f.atlas.get(false,0,1800);assert.equal(f.tasks.size,1);f.flush();
 assert.deepEqual(f.generated.map(x=>x.resolution),[512,2048]);assert.equal(f.ready,1);
 const high=f.atlas.get(false,0,1800);assert.equal(high.width,2048);assert.equal(f.atlas.get(false,0,700),high);assert.equal(f.tasks.size,0);f.atlas.destroy();
});
test('dragging pauses texture work, and leaving the scene cancels pending work',()=>{
 const f=atlasFixture();f.atlas.get(true,1,1800);f.atlas.pause();assert.equal(f.tasks.size,0);assert.equal(f.generated.length,1);
 f.atlas.resume();assert.equal(f.tasks.size,1);const oldCallback=[...f.tasks.values()][0];f.atlas.destroy();assert.equal(f.tasks.size,0);
 oldCallback();assert.equal(f.ready,0);assert.equal(f.atlas.get(true,1,1800),null);
});
test('theme changes discard obsolete refinement and allocation failure keeps a working image',()=>{
 const f=atlasFixture({fail:true});f.atlas.get(false,0,900);f.atlas.get(true,0,900);assert.equal(f.tasks.size,1);f.flush();
 assert.equal(f.generated.at(-1).sky,true);assert.equal(f.warnings.length,1);
 assert.equal(f.atlas.get(true,0,900).width,512);assert.equal(f.tasks.size,0,'A failed allocation must not retry every frame');f.atlas.destroy();
});
test('the texture budget evicts older detail rather than retaining every level and theme',()=>{
 const f=atlasFixture({maxBytes:21*1024*1024});
 f.atlas.get(false,0,1800);f.flush();f.atlas.get(false,1,1800);f.flush();f.atlas.get(false,0,1800);
 assert.equal(f.generated.filter(x=>x.variant===0&&x.resolution===512).length,2);f.atlas.destroy();
});
