const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/app.js', 'utf8');
const prefix = source.slice(0, source.indexOf('// ------------------------------------------------------------------ boot'))
  .replace(/^const loadGraph = .*$/m, 'const loadGraph = () => graphLoader();');
const syncRefresh = source.slice(source.indexOf('let remoteRefreshNeeded=false;'), source.indexOf('addEventListener("lumen-remote-updated"'));
function interfaceApp({stored = {}, reduced = false, request, graphLoader} = {}) {
  const elements = new Map(), storage = new Map(Object.entries(stored).map(([k, v]) => ['lumen.' + k, JSON.stringify(v)]));
  const events = [], mounts = [], pages = [], attributes = new Map();
  const media = {matches: reduced, addEventListener() {}};
  class Element {
    constructor(id = '') { this.id = id; this.isConnected = true; this.value = ''; this.dataset = {}; this.attributes = new Map(); this.style = {}; this.children = []; this.handlers = {}; this._html = ''; this.classList = {toggle: () => false, contains: () => false, remove() {}, add() {}}; }
    set innerHTML(value) {
      this._html = value;
      if (this.id === 'main') {
        for (const [id, el] of elements) if (!['main', 'q', 'theme', 'nav-top', 'tree', 'nav-foot'].includes(id)) el.isConnected = false;
        pages.push(value);
      }
      for (const match of value.matchAll(/\bid="([^"]+)"/g)) { const el = new Element(match[1]); el.parentElement = this; elements.set(match[1], el); }
    }
    get innerHTML() { return this._html; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key); }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    focus() { document.activeElement=this;this.handlers.focus?.({target:this}); }
    blur() { if(document.activeElement===this){document.activeElement=null;this.handlers.blur?.({target:this});} }
    append(el) { this.children.push(el); el.parentElement = this; }
    remove() { this.isConnected = false; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  for (const id of ['main', 'q', 'theme', 'nav-top', 'tree', 'nav-foot']) elements.set(id, new Element(id));
  const document = {documentElement: {dataset: {}}, activeElement: null,
    querySelector(selector) { if (selector[0] === '#') return elements.get(selector.slice(1)) || null; return null; },
    querySelectorAll() { return []; }, createElement: () => new Element(), body: new Element('body')};
  const tree = {id: 'root', kind: 'root', title: 'Knowledge', children: [], inbox: {id: 'inbox', children: []}, archive: {id: 'archive', children: []}};
  const context = {document, location: {hash: '#/'}, history: {replaceState() {}}, window: {dispatchEvent(e) {events.push(e.type);}}, localStorage: {getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v)}, matchMedia: () => media, Event, console, FormData,
    setTimeout: () => 0, clearTimeout() {}, clearInterval() {}, setInterval: () => 0, confirm: () => true, navigator: {}, URLSearchParams,
    fetch: async (path) => new Response(JSON.stringify(await (request?.(path) ?? (path === '/api/tree' ? tree : {nodes: [], edges: []}))), {headers: {'Content-Type': 'application/json'}}),
    graphLoader: graphLoader || (() => Promise.resolve({mountGraph(host, data) { const graph = {host, data, destroy() {graph.destroyed = true;}, setFilter() {}, setQuery() {}, clear() {}, fit() {}, focus() {}}; mounts.push(graph); return graph; }}))};
  vm.createContext(context); vm.runInContext(prefix + '\n' + syncRefresh, context);
  vm.runInContext('TREE = ' + JSON.stringify(tree), context);
  return {context, document, elements, storage, media, events, mounts, pages, run: code => vm.runInContext(code, context)};
}
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };

test('Sky and Space migrate old preferences, persist switching, and announce theme changes', () => {
  const app = interfaceApp();
  app.run('setAtmosphere("light")');
  assert.equal(app.document.documentElement.dataset.theme, 'sky');
  assert.equal(app.elements.get('theme').getAttribute('aria-pressed'), 'true');
  assert.match(app.elements.get('theme').innerHTML, /Sky/);
  assert.equal(app.storage.get('lumen.theme'), '"sky"');
  app.run('setAtmosphere("dark")');
  assert.equal(app.document.documentElement.dataset.theme, 'space');
  assert.equal(app.elements.get('theme').getAttribute('aria-pressed'), 'false');
  assert.match(app.elements.get('theme').getAttribute('aria-label'), /Switch to Sky/);
  assert.deepEqual(app.events, ['lumen-theme-changed', 'lumen-theme-changed']);
});
test('motion preference is persistent and device reduced-motion wins over Drift', () => {
  const app = interfaceApp({reduced: true});
  app.run('setMotion("full")');
  assert.equal(app.run('motionIsCalm()'), true);
  assert.equal(app.storage.get('lumen.motion'), '"full"');
  app.media.matches = false;
  assert.equal(app.run('motionIsCalm()'), false);
  app.run('setMotion("calm")');
  assert.equal(app.run('motionIsCalm()'), true);
  assert.equal(app.storage.get('lumen.motion'), '"calm"');
});
test('recent lectures sort correctly with browser millisecond dates and Python ISO dates', () => {
  const app = interfaceApp();
  const ordered = app.run('JSON.stringify([{id:"older",created:1700000000000},{id:"new",created:1800000000000},{id:"iso",created:"2024-01-01T00:00:00Z"}].sort(newestFirst).map(x=>x.id))');
  assert.deepEqual(JSON.parse(ordered), ['new', 'iso', 'older']);
});
test('a late note response cannot replace the newer library route', async () => {
  const note = deferred();
  const app = interfaceApp({request: path => path === '/api/notes/a' ? note.promise : {nodes: [], edges: []}});
  app.context.location.hash = '#/note/a';
  const first = app.run('route()');
  app.context.location.hash = '#/library';
  await app.run('route()');
  const library = app.elements.get('main').innerHTML;
  note.resolve({id: 'a', title: 'Late private draft', body: '', breadcrumbs: []});
  await first;
  assert.equal(app.elements.get('main').innerHTML, library);
  assert.match(library, /<h1>Library<\/h1>/);
});
test('a superseded graph load never mounts a canvas into the newer page', async () => {
  const graph = deferred(); let mounts = 0;
  const app = interfaceApp({graphLoader: () => graph.promise});
  const first = app.run('route()');
  app.context.location.hash = '#/library'; await app.run('route()');
  graph.resolve({mountGraph() {mounts++;}}); await first;
  assert.equal(mounts, 0);
  assert.match(app.elements.get('main').innerHTML, /<h1>Library<\/h1>/);
});
test('an empty library still mounts the particle universe without adding sample knowledge', async () => {
  const app = interfaceApp();
  await app.run('route()');
  assert.equal(app.mounts.length, 1);
  assert.equal(app.mounts[0].data.nodes.length, 0);
  assert.equal(app.mounts[0].data.edges.length, 0);
  assert.match(app.elements.get('main').children[0].innerHTML, /Import a lecture/);
  assert.equal(app.document.documentElement.dataset.view, 'universe');
  assert.equal(app.elements.get('gmotion').getAttribute('aria-pressed'), 'true');
});
test('unchanged remote state leaves the active universe camera and canvas intact', async () => {
  const app = interfaceApp();
  await app.run('route()');
  app.run('refreshAfterSync()');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.mounts.length, 1);
  assert.equal(app.mounts[0].destroyed, undefined);
});
test('the entrance has no greeting, counts or orbit slogan, and groups view settings quietly',async()=>{
 const app=interfaceApp();await app.run('route()');const html=app.elements.get('main').innerHTML;
 for(const excess of ['Your knowledge, in orbit','id="gstats"','graph-title','Good morning','Good evening',' connections'])assert(!html.includes(excess));
 assert(html.includes('<details class="universe-options"'));assert(html.includes('aria-label="Zoom in"'));assert(html.includes('aria-label="Return to the whole universe"'));
});
test('search typing never focuses the camera; selecting closes the keyboard and clearing restores the scene',async()=>{
 const calls={focus:[],input:[],fit:0},data={nodes:[{id:'lecture',kind:'lecture',title:'Lecture 01 - Experiments',section:'s'}],edges:[]};
 const graph={setQuery(){},setInputActive:value=>calls.input.push(value),focus:id=>calls.focus.push(id),clear(){},fit(){calls.fit++},destroy(){}};
 const app=interfaceApp({request:()=>data,graphLoader:()=>Promise.resolve({mountGraph:()=>graph})});await app.run('route()');const input=app.elements.get('gq');input.focus();input.value='experiments';input.handlers.input({target:input});assert.equal(calls.focus.length,0);assert(!app.elements.get('gsearch-results').hidden);
 app.elements.get('gsearch').handlers.submit({preventDefault(){}});assert.deepEqual(calls.focus,['lecture']);assert.equal(app.document.activeElement,null);assert.equal(calls.input.at(-1),false);
 input.focus();input.value='';input.handlers.input({target:input});input.blur();assert.equal(calls.fit,1);assert(app.elements.get('gsearch-results').hidden);
});
test('native view transitions perform rendering inside the update callback', async () => {
  const app = interfaceApp();
  await app.run('route()');
  let called = false, callbackFinished = false;
  app.document.startViewTransition = update => {
    called = true;
    const done = Promise.resolve().then(update).then(() => {callbackFinished = true;});
    return {ready: done, updateCallbackDone: done, finished: done, skipTransition() {}};
  };
  app.context.location.hash = '#/library';
  await app.run('route()');
  assert.equal(called, true);
  assert.equal(callbackFinished, true);
  assert.equal(app.mounts[0].destroyed, true);
  assert.match(app.elements.get('main').innerHTML, /<h1>Library<\/h1>/);
});
test('slides view renders all original PDF pages, including pages without aligned captions',()=>{
 const app=interfaceApp(),mounted=[],file={id:'original',name:'Slides.pdf',uploaded:true};
 app.context.window.LumenCloud={};app.context.window.LumenPDF={mountPage:(host,source,page)=>mounted.push({source,page})};
 const body={innerHTML:'',querySelectorAll(selector){return selector==='[data-pdf-page]'?[1,2,3].map(page=>({dataset:{pdfPage:String(page)}})):[]}};
 app.context.pdfBody=body;app.run('LECTURE='+JSON.stringify({meta:{source_pdf:file,slide_count:3},chunks:[{n:1,page:1,title:'Opening',said:[{text:'Evidence',start:0,id:0}]}]}));app.run('renderSlides(pdfBody,"lecture")');
 assert.deepEqual(mounted.map(x=>x.page),[1,2,3]);assert.equal((body.innerHTML.match(/data-pdf-page=/g)||[]).length,3);assert.match(body.innerHTML,/No prepared explanation/);assert.match(body.innerHTML,/<details class="source-wording">/);assert.doesNotMatch(body.innerHTML,/ghost-slide/);
});
test('older text-only imports explicitly request reattaching the original PDF',()=>{
 const app=interfaceApp();app.context.window.LumenCloud={};app.context.window.LumenPanopto={};app.context.window.LumenPDF={};
 const body={innerHTML:'',querySelectorAll(){return []}};app.context.pdfBody=body;app.run('LECTURE='+JSON.stringify({meta:{},chunks:[{n:1,page:1,title:'Text only',said:[]}]}));app.run('renderSlides(pdfBody,"lecture")');
 assert.match(body.innerHTML,/Earlier text-only imports/);assert.match(body.innerHTML,/Add slides/);
});
test('the lecture reader has three views and never mounts the old cards or resource navigation',async()=>{
 const lecture={meta:{id:'l',title:'Lecture 01',status:'complete'},breadcrumbs:[],chunks:[],generated:{},generated_html:{'study-pack.md':'<h2>Understand the experiment</h2><p>A worked example.</p>','flashcards.md':'OLD CARDS','resources.md':'OLD RESOURCES','explain-one.md':'<p>A useful explanation.</p>'},my_notes:''};
 const app=interfaceApp({request:()=>lecture});app.context.window.LumenCloud={};await app.run('pageLecture("l","cards")');
 const html=app.elements.get('main').innerHTML;assert.equal((html.match(/role="tab"/g)||[]).length,3);
 for(const title of ['Lecture','Slides','Notes'])assert(html.includes('>'+title+'</button>'));
 for(const old of ['Flashcards','Further resources','Copy tutor','Replace original PDF','Review captions','Add study material'])assert(!html.includes(old));
 const reading=app.elements.get('tabbody').innerHTML;assert(reading.includes('A worked example')&&reading.includes('A useful explanation'));assert(!reading.includes('OLD CARDS')&&!reading.includes('OLD RESOURCES'));
});
test('Markdown imports show their consolidated material without appending stale standalone explanations',async()=>{
 const lecture={meta:{id:'l',title:'Lecture',status:'complete',lesson_source:'markdown'},breadcrumbs:[],chunks:[],generated:{},generated_html:{'study-pack.md':'<p>New complete material.</p>','explain-old.md':'Outdated explanation'},my_notes:''};
 const app=interfaceApp({request:()=>lecture});await app.run('pageLecture("l")');assert(app.elements.get('tabbody').innerHTML.includes('New complete material'));assert(!app.elements.get('tabbody').innerHTML.includes('Outdated explanation'));
});
test('prepared manual Q&A renders a keyboard-accessible answer reveal with escaped content',async()=>{
 const app=interfaceApp();let rendered;
 app.context.qaRoot={querySelectorAll:selector=>selector==='pre > code.language-qa'?[{textContent:JSON.stringify({q:'What causes <change>?',a:'Compare groups.\n<script>unsafe</script>'}),parentElement:{replaceWith(node){rendered=node}}}]:[]};
 await app.run('enhance(qaRoot)');assert.equal(rendered.className,'practice-question');assert(rendered.innerHTML.includes('<summary>What causes &lt;change&gt;?'));assert(!rendered.innerHTML.includes('<script>'));
});
test('the atmosphere control cycles Space, Sky and Aurora and remembers Aurora', () => {
  const app = interfaceApp();
  app.run('setAtmosphere("aurora")');
  assert.equal(app.document.documentElement.dataset.theme, 'aurora');
  assert.equal(app.storage.get('lumen.theme'), '"aurora"');
  assert.match(app.elements.get('theme').innerHTML, /Aurora/);
  assert.match(app.elements.get('theme').getAttribute('aria-label'), /Switch to Space/);
  app.run('setAtmosphere("sky")');
  assert.match(app.elements.get('theme').getAttribute('aria-label'), /Switch to Aurora/);
});
