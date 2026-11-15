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
