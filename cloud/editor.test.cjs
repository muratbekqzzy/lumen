const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync('web/app.js', 'utf8');
const state = src.slice(src.indexOf('let activeEditor = null;'), src.indexOf('async function loadTree()'));
const editorFn = src.slice(src.indexOf('function renderEditor('), src.indexOf('async function pageNote('));
const refreshFn = src.slice(src.indexOf('let remoteRefreshNeeded=false;'), src.indexOf('addEventListener("lumen-remote-updated"'));
const hooks = {}, calls = [], notifications = [];
const ed = { value: 'Start', isConnected: true, addEventListener: (name, fn) => hooks[name] = fn };
const button = {}, pv = {}, notice = { hidden: true };
const el = { '#ed': ed, '#save': button, '#pv': pv, '#editor-sync-notice': notice };
let confirms = false;
const context = {
  $: key => el[key] || null, h: v => v, api: async () => '', enhance() {},
  location: { hash: '#/note/test?edit' }, history: { replaceState: (...args) => calls.push(args) },
  window: { LumenCloud: { activeAccountId: 'user-a' } }, document: { activeElement: null },
  confirm: () => confirms, setTimeout: () => 0, clearTimeout() {},
  toast: text => notifications.push(text), console,
  loadTree: async () => calls.push('tree'), route: () => calls.push('route')
};
vm.createContext(context);
vm.runInContext(state + editorFn + refreshFn, context);
require('node:test')('unsaved drafts survive sync, save races and account changes', async () => {
  let release, received;
  context.save = (text, expected) => { received = {text, expected}; return new Promise(r => release = r); };
  vm.runInContext('renderEditor({innerHTML:""}, "Start", save)', context);
  ed.value = 'Draft'; hooks.input();
  assert.equal(vm.runInContext('hasUnsavedDraft()', context), true);
  vm.runInContext('refreshAfterSync()', context);
  assert.equal(notice.hidden, false);
  assert.equal(calls.includes('tree'), false, 'Blurred draft survives remote refresh');
  const saving = button.onclick();
  assert.deepEqual(received, {text: 'Draft', expected: 'Start'});
  ed.value = 'Newer draft'; hooks.input();
  release({conflictPreserved:true}); await saving;
  assert.equal(vm.runInContext('hasUnsavedDraft()', context), true, 'Typing during save stays dirty');
  assert.equal(button.textContent, 'Save •');
  context.window.LumenCloud.activeAccountId = 'user-b';
  received = null; await button.onclick();
  assert.equal(received, null, 'Draft cannot save into a different account');
  assert.match(notifications.at(-1), /account changed/);
  assert.equal(vm.runInContext('allowEditorReplacement("#/library")', context), false);
  assert.equal(calls.at(-1)[2], '#/note/test?edit');
  confirms = true;
  assert.equal(vm.runInContext('allowEditorReplacement("#/library")', context), true);
  assert.equal(vm.runInContext('hasUnsavedDraft()', context), false);
});

function singlePaneEditor() {
  const hooks={},requests=[],saved=[],ed={value:'Start',isConnected:true,addEventListener(name,fn){hooks[name]=fn;},focus(){this.focused=true;}},pv={},toggle={setAttribute(name,value){this[name]=value;}},saveButton={};
  const elements={'#ed':ed,'#pv':pv,'#save':saveButton,'#preview-notes':toggle};
  const ctx={$:key=>elements[key]||null,h:v=>v,location:{hash:'#/lecture/test?tab=notes'},window:{LumenCloud:{activeAccountId:'user-a'}},toast(){},console:{error(){}},enhance(){},
    api(method,path,payload){return new Promise((resolve,reject)=>requests.push({method,path,payload,resolve,reject}));},
    save:async(text,expected)=>{saved.push({text,expected});return {};}};
  vm.createContext(ctx);vm.runInContext(state+editorFn,ctx);vm.runInContext('renderEditor({innerHTML:""},"Start",save)',ctx);
  return {ctx,ed,pv,toggle,saveButton,hooks,requests,saved};
}
require('node:test')('Notes uses one pane and preview never replaces or saves a draft',async()=>{
  const f=singlePaneEditor();
  assert.equal(f.ed.hidden,false);assert.equal(f.pv.hidden,true);assert.equal(f.requests.length,0);
  f.ed.value='My **draft**';f.hooks.input();
  assert.equal(f.requests.length,0,'Typing does not render an invisible duplicate');
  f.toggle.onclick();assert.equal(f.ed.hidden,true);assert.equal(f.pv.hidden,false);assert.equal(f.toggle['aria-pressed'],'true');
  assert.equal(f.requests[0].payload.body,'My **draft**');assert.equal(f.saved.length,0);
  f.requests[0].resolve('<p>My <strong>draft</strong></p>');await new Promise(setImmediate);
  assert.match(f.pv.innerHTML,/<strong>draft<\/strong>/);
  f.toggle.onclick();assert.equal(f.ed.hidden,false);assert.equal(f.pv.hidden,true);assert.equal(f.ed.value,'My **draft**');assert(f.ed.focused);
  assert.equal(vm.runInContext('hasUnsavedDraft()',f.ctx),true);
  await f.saveButton.onclick();assert.deepEqual(f.saved,[{text:'My **draft**',expected:'Start'}]);
});
require('node:test')('returning to Edit rejects a stale preview, and a failed preview keeps the draft',async()=>{
  const f=singlePaneEditor();f.toggle.onclick();f.toggle.onclick();
  f.ed.value='Newer draft';f.hooks.input();f.toggle.onclick();
  f.requests[1].resolve('<p>Newer draft</p>');await new Promise(setImmediate);
  f.requests[0].resolve('<p>Old content</p>');await new Promise(setImmediate);
  assert.equal(f.pv.innerHTML,'<p>Newer draft</p>');
  f.toggle.onclick();f.toggle.onclick();f.requests[2].reject(new Error('Renderer unavailable'));await new Promise(setImmediate);
  assert.match(f.pv.innerHTML,/Choose Edit/);f.toggle.onclick();assert.equal(f.ed.value,'Newer draft');assert.equal(f.saved.length,0);
});
