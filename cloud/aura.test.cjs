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
 const f=fixture();assert.equal(f.body.firstChild,f.atmosphere);assert.equal(f.atmosphere['aria-hidden'],'true');assert.equal(f.meta.content,'#15131f');
 f.document.documentElement.dataset.theme='sky';f.windowEvents['lumen-theme-changed']();assert.equal(f.meta.content,'#f4eef6');
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
