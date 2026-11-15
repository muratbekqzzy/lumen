const test=require('node:test'),assert=require('node:assert/strict');
const {browser,api}=require('./browser-fixture.cjs');
const header=(extra='')=>'---\nlumen: 1\nsection: Neuropsychology\nmodule: PSYC 1142\nlecture: Lecture 01 - Research design\ncategory: academic\n'+extra+'---\n\n';
const document=()=>header()+'# Research design\n\n## Understand\nA [[Control group]] supports comparison.\n\n```quiz\n{"questions":[{"q":"Why compare?","options":["A","B"],"answer":0,"why":"Reason"}]}\n```\n\n```plotly\n{"data":[{"x":[1,2],"y":[2,3]}]}\n```\n\n```widget\n<h2>Inside a widget</h2>\n<script>const n=1;</script>\n```\n\n# Slide explanations\n\n## Slide 1 - Comparison\nCompare otherwise equivalent groups.\n\n## Slide 2\nProtect [[Internal validity]].';
async function importFile(b,text=document(),destination={}){return api(b,'POST','/api/lectures/import-markdown',{text,filename:'lecture.md',destination,accountId:b.window.LumenCloud.activeAccountId});}
test('one Markdown file creates a complete organised lecture with no recording, captions or PDF',async()=>{
 const b=browser(),r=await importFile(b),d=await api(b,'GET','/api/lectures/'+r.id),state=b.window.LumenCloud.exportData(),module=state.records[d.meta.parent],section=state.records[module.parent];
 assert.equal(section.title,'Neuropsychology');assert.equal(module.title,'PSYC 1142');assert.equal(d.meta.title,'Lecture 01 - Research design');assert.equal(d.meta.lesson_source,'markdown');assert.equal(d.meta.status,'complete');assert(!d.meta.segments&&!d.meta.source_pdf);
 assert.deepEqual(Object.keys(d.generated),['study-pack.md']);for(const name of ['quiz','plotly','widget'])assert(d.generated_html['study-pack.md'].includes('language-'+name));
 assert.equal(d.slide_explanations_html.length,2);assert(d.slide_explanations_html[0].html.includes('Compare otherwise'));assert(!d.generated['study-pack.md'].includes('# Slide explanations'));assert(!d.prepared_practice_html);
 assert.equal((await api(b,'GET','/api/search?q=otherwise'))[0].id,r.id);
});
test('reimporting the same file updates the same lecture once, then is a no-op',async()=>{
 const b=browser(),first=await importFile(b),before=b.window.LumenCloud.exportData(),history=(await api(b,'GET','/api/history')).length;
 const repeated=await importFile(b);assert.equal(repeated.id,first.id);assert(repeated.unchanged);assert.deepEqual(b.window.LumenCloud.exportData(),before);assert.equal((await api(b,'GET','/api/history')).length,history);
 const updated=await importFile(b,document().replace('supports comparison','provides a baseline'));assert.equal(updated.id,first.id);assert.equal(Object.values(b.window.LumenCloud.exportData().records).filter(n=>n.kind==='lecture').length,1);
});
test('an import updates material while preserving existing sources, private notes and older resources',async()=>{
 const b=browser(),first=await importFile(b),n=b.window.LumenCloud.exportData().records[first.id];await api(b,'PUT','/api/lectures/'+n.id+'/notes',{body:'My insight'});
 await api(b,'PUT','/api/lectures/'+n.id+'/transcript',{segments:[{id:0,start:0,end:1,text:'Original source'}]});
 await api(b,'PUT','/api/lectures/'+n.id+'/slides-file',{file:{id:'12345678-1234-4abc-8def-123456789012',name:'Original.pdf',size:10,uploaded:true},page_count:2});
 await api(b,'PUT','/api/lectures/'+n.id+'/materials',{kind:'resources',body:'Verified reference'});await api(b,'PUT','/api/lectures/'+n.id+'/materials',{kind:'flashcards',body:'Q: Old question\nA: Old answer'});
 await importFile(b,document().replace('supports comparison','provides a reference'));const result=await api(b,'GET','/api/lectures/'+n.id);
 assert.equal(result.my_notes,'My insight');assert.equal(result.meta.source_pdf.name,'Original.pdf');assert.equal(result.meta.segments[0].text,'Original source');assert.equal(result.generated['resources.md'],'Verified reference');assert.equal(result.generated['flashcards.md'],'Q: Old question\nA: Old answer');
 await api(b,'POST','/api/undo');assert((await api(b,'GET','/api/lectures/'+n.id)).generated['study-pack.md'].includes('supports comparison'));
});
test('context can place a file without a header; explicit metadata can target a different module',async()=>{
 const b=browser(),first=await importFile(b),record=b.window.LumenCloud.exportData().records[first.id];
 const updated=await importFile(b,'# Prepared material\n\nA concise explanation.',{lecture_id:record.id});assert.equal(updated.id,record.id);
 const elsewhere=await importFile(b,header().replace('PSYC 1142','PSYC 1143')+'# Another lecture\n\nA different topic.');assert.notEqual(elsewhere.id,record.id);
});
test('module codes and lecture numbers resolve an existing full title without prefix collisions',async()=>{
 const b=browser(),first=await importFile(b),state=b.window.LumenCloud.exportData(),n=state.records[first.id],module=state.records[n.parent];
 await api(b,'POST','/api/rename',{id:module.id,title:'PSYC 1142: Research Methods in Psychology'});await api(b,'POST','/api/containers',{parent_id:module.parent,title:'PSYC 11425: Other course'});
 assert.equal((await importFile(b,document().replace('Lecture 01 - Research design','Lecture 1').replace('supports comparison','supports causal reasoning'))).id,first.id);
});
test('ambiguous destinations stop atomically and stable IDs disambiguate explicitly',async()=>{
 const b=browser(),first=await importFile(b),state=b.window.LumenCloud.exportData(),module=state.records[state.records[first.id].parent];
 await api(b,'POST','/api/containers',{parent_id:module.parent,title:module.title});const before=b.window.LumenCloud.exportData();
 await assert.rejects(()=>importFile(b,document().replace('supports comparison','New explanation')),/More than one module/);assert.deepEqual(b.window.LumenCloud.exportData(),before);
 assert.equal((await importFile(b,'# Clear material\n\nWith an explicit lecture.',{lecture_id:first.id})).id,first.id);
});
test('malformed headers, rich blocks, oversized files and invalid destinations never partially create folders',async()=>{
 const b=browser(),before=b.window.LumenCloud.exportData();
 for(const text of ['---\nsection: New\n# No end',header('section: Duplicate\n')+'Body',header('__proto__: wrong\n')+'Body',header()+'```quiz\n{"questions":[{"q":"Q","options":["A","B"],"answer":9}]}\n```',header()+'```widget\nUnclosed','é'.repeat(600000)])await assert.rejects(()=>importFile(b,text));
 await assert.rejects(()=>importFile(b,document(),{module_id:'missing'}));assert.deepEqual(b.window.LumenCloud.exportData(),before);
});
test('only explicitly supplied practice is imported; headings inside widgets do not split the document',async()=>{
 const b=browser(),parse=b.window.LumenImport.parse;
 const parsed=parse(header()+'# Lesson\n\n```widget\n# Flashcards\n## Slide 1\n```\n\n# Flashcards\nQ: Why?\nA: A reason.\n\n# Explanation\nA deeper explanation.');
 assert(parsed.content.includes('# Flashcards\n## Slide 1'));assert.equal(parsed.practice,'Q: Why?\nA: A reason.');assert(parsed.content.includes('A deeper explanation.'));assert.equal(parsed.slide_explanations.length,0);
 const imported=await importFile(b,header()+'# Lesson\n\nExplanation.\n\n# Practice questions\n```qa\n{"q":"Question?","a":"Answer."}\n```');assert((await api(b,'GET','/api/lectures/'+imported.id)).prepared_practice_html.includes('language-qa'));
});
test('flat metadata supports quoted colons, aliases and BOM/CRLF, and templates round-trip',()=>{
 const b=browser(),parse=b.window.LumenImport.parse;
 const parsed=parse('\uFEFF---\r\nsection: "Career: development"\r\ncourse: Skill building\r\ntitle: Lecture 02\r\ntype: Professional\r\n---\r\n# Growth\r\n\r\nConcise teaching.');assert.equal(parsed.metadata.section,'Career: development');assert.equal(parsed.metadata.module,'Skill building');assert.equal(parsed.metadata.category,'professional');
 const template=b.window.LumenImport.template({section:'S',module:'M',lecture:'Lecture 01',lecture_id:'lecture'});const result=parse(template);assert.equal(result.metadata.lecture_id,'lecture');assert.equal(result.slide_explanations[0].page,1);assert(result.content.includes('language')===false);assert.equal(result.practice,'');
});
test('a hosted import rejects an account-switch race before changing either library',async()=>{
 const b=browser({hosted:true,fetch:async()=>Response.json({user:{id:'alice'},revision:0,state:null})});await b.window.LumenCloud.sync();
 await assert.rejects(()=>api(b,'POST','/api/lectures/import-markdown',{text:document(),accountId:'bob'}),/account changed/);assert.equal(Object.values(b.window.LumenCloud.exportData().records).filter(n=>n.kind==='lecture').length,0);
});
