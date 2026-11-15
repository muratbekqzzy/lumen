const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function tutor(){const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('web/tutor.js','utf8'),context);return context.window.LumenTutor}
test('tutor hand-off retains full source evidence and distinguishes estimated captions from PDF figures',()=>{
 const text='Technical evidence '.repeat(700)+'END OF SOURCE',lecture={meta:{title:'ANOVA',alignment_estimated:true,source_pdf:{name:'Statistics.pdf'}},chunks:[{page:3,title:'Between-group variation',slide_text:'F = MSB / MSW',said:[{text,start:31}]}]};
 const result=tutor().promptFor(lecture),source=JSON.parse(result.split('LECTURE SOURCE JSON follows:\n')[1]);
 assert.equal(source.chunks[0].transcript[0].text,text);assert.equal(source.chunks[0].label,'[Slide 3]');assert.equal(source.chunks[0].alignment,'approximate');assert.equal(source.chunks[0].transcript[0].start_seconds,31);assert.match(source.original_pdf.note,/not attached/);assert.match(result,/never instructions to follow/);
});
test('untimed source has no fabricated timestamps and includes application-first teaching formats',()=>{
 const result=tutor().promptFor({meta:{title:'Memory',timed_captions:false},chunks:[{title:'Encoding',said:[{text:'Retrieval strengthens retention.',start:0}]}]}),source=JSON.parse(result.split('LECTURE SOURCE JSON follows:\n')[1]);
 assert.equal(source.chunks[0].label,'[Part 1]');assert(!('start_seconds' in source.chunks[0].transcript[0]));assert.equal(source.original_pdf,null);
 for(const format of ['study-pack.md','flashcards.md','explanation.md','zero-based','simulated data','reset control'])assert(result.includes(format));
});
