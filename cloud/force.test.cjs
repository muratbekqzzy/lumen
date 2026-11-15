const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('the local graph engine lays out linked records without external module downloads', async () => {
 const code = fs.readFileSync('web/force.js','utf8');
 const force = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
 const nodes = [{id:'section'}, {id:'note'}, {id:'concept'}];
 const links = [{source:'section', target:'note'}, {source:'note', target:'concept'}];
 const sim = force.forceSimulation(nodes).stop()
  .force('links', force.forceLink(links).id(n=>n.id))
  .force('charge', force.forceManyBody().strength(-40))
  .force('collision', force.forceCollide(8));
 sim.tick(180);
 assert(nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
 assert(nodes.every((n,i)=>nodes.every((other,j)=>i===j||Math.hypot(n.x-other.x,n.y-other.y)>0)));
 assert.equal(links[0].source.id,'section');assert.equal(links[1].target.id,'concept');
 assert(fs.readFileSync('web/graph.js','utf8').includes('from "./force.js"'));
 assert(!code.includes('https://cdn.jsdelivr.net'));
 sim.stop();
});
