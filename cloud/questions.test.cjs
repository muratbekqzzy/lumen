const test=require('node:test'),assert=require('node:assert/strict');
const {browser,api}=require('./browser-fixture.cjs');
function library(b){const state=b.window.LumenCloud.exportData();state.records.lecture={id:'lecture',kind:'lecture',parent:'inbox',title:'Lecture 1',body:'Existing private notes',generated:{'study-pack.md':'Prepared material'},created:1,updated:1};b.window.LumenCloud.importData(state);}
test('direct questions append to the latest notes and preserve sources and earlier questions',async()=>{
 const b=browser();library(b);await api(b,'GET','/api/lectures/lecture');
 await api(b,'PUT','/api/lectures/lecture/notes',{body:'Newer private notes'});
 await api(b,'POST','/api/lectures/lecture/questions',{q:' First? ',a:' Answer 1 '});await api(b,'POST','/api/lectures/lecture/questions',{q:'Second?',a:'Answer 2'});
 const lecture=await api(b,'GET','/api/lectures/lecture');assert(lecture.my_notes.startsWith('Newer private notes'));assert(lecture.my_notes.includes('"q":"First?"'));assert(lecture.my_notes.includes('"q":"Second?"'));assert.equal(lecture.generated['study-pack.md'],'Prepared material');
 const before=JSON.stringify(b.window.LumenCloud.exportData());await assert.rejects(api(b,'POST','/api/lectures/lecture/questions',{q:' ',a:'No'}));assert.equal(JSON.stringify(b.window.LumenCloud.exportData()),before);
});
test('a question cannot be saved to another signed-in account',async()=>{
 const saved=new Map([['lumen.account.v1',JSON.stringify('user-b')]]),b=browser({hosted:true,saved});
 const state=b.window.LumenCloud.exportData();state.records.lecture={id:'lecture',kind:'lecture',parent:'inbox',title:'Lecture',body:'Private notes',created:1,updated:1};
 saved.set('lumen.account.data.v1.user-b',JSON.stringify(state));
 await assert.rejects(api(b,'POST','/api/lectures/lecture/questions',{q:'Question',a:'Answer',accountId:'user-a'}),/account changed/);
 assert.equal(JSON.parse(saved.get('lumen.account.data.v1.user-b')).records.lecture.body,'Private notes');
});
