const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {browser,api}=require('./browser-fixture.cjs');
const source=fs.readFileSync('web/markdown.js','utf8');
function markdown(text){const context={window:{}};vm.runInNewContext(source,context);return context.window.LumenMarkdown.render(text)}
const segment=(id,start,text)=>({id,start,end:start+2,text});
test('browser study material preserves tables, lists, quiz/plotly/widget fences and concept links safely',()=>{
 const html=markdown('# Study\n\n- Retrieve\n- Apply\n\n| Idea | Meaning |\n| --- | --- |\n| Memory | Retrieval |\n\n```quiz\n{"questions":[]}\n```\n\n```plotly\n{"data":[]}\n```\n\n```widget\n<script>alert(1)</script>\n```\n\n[[Memory|Recall]] and `[[Not a concept]]`.\n\n<script>alert(2)</script>\n\n[bad](javascript:alert(3))');
 assert(html.includes('<table>')&&html.includes('<ul>'));
 for(const kind of ['quiz','plotly','widget'])assert(html.includes('class="language-'+kind+'"'));
 assert(html.includes('href="#/concept/Memory"'));assert(!html.includes('href="#/concept/Not'));
 assert(!html.includes('<script>'));assert(!html.includes('href="javascript:'));
 assert(markdown('\\(x^2\\) and \\[y=2\\]').includes('\\(x^2\\)'));
});
test('sparse transcript IDs resolve to the right speech, outlines and playback links',async()=>{
 const b=browser(),segments=[segment(3,1,'Early introduction'),segment(19,20,'Hippocampus and retrieval')];
 const created=await api(b,'POST','/api/lectures/from-panopto',{title:'Lecture',segments,panopto_url:'https://school.hosted.panopto.com/Panopto/Pages/Viewer.aspx?start=999&id=abc',chunks:[{n:1,title:'Memory',start:0,end:22,segmentIds:[3,19]}]});
 const lecture=await api(b,'GET','/api/lectures/'+created.id);
 assert.equal(lecture.chunks[0].said[1].text,'Hippocampus and retrieval');
 const url=new URL(lecture.chunks[0].link);assert.deepEqual(url.searchParams.getAll('start'),['0']);assert.equal(url.searchParams.get('id'),'abc');
 const pack=b.window.LumenPanopto.makePack('Lecture',segments,[],lecture.chunks,true);
 assert(pack['study-pack.md'].includes('Early introduction'));assert(pack['flashcards.md'].includes('Hippocampus'));
});
test('search and universe concepts include study packs, slide text and transcript; code examples and archived items stay out of the graph',async()=>{
 const b=browser(),lecture=await api(b,'POST','/api/lectures/from-panopto',{title:'Lecture',segments:[segment(5,0,'Reconsolidation changes recalled memories')],chunks:[{n:1,title:'Memory',start:0,end:2,slide_text:'Synaptic plasticity',segmentIds:[5]}],generated:{'study-pack.md':'[[Hippocampus]] supports encoding. `[[ExampleOnly]]`','explain-memory.md':'A [[Memory systems]] explanation.'}});
 for(const query of ['reconsolidation','synaptic','encoding'])assert.equal((await api(b,'GET','/api/search?q='+query))[0].id,lecture.id);
 const graph=await api(b,'GET','/api/graph');assert(graph.nodes.some(n=>n.id==='c:hippocampus'));assert(!graph.nodes.some(n=>n.id==='c:exampleonly'));
 assert.equal((await api(b,'GET','/api/concept/Hippocampus')).mentions[0].part,'Generated/study-pack.md');
 assert.equal((await api(b,'GET','/api/concept/Memory')).mentions.length,0,'concept matching must be exact');
 await api(b,'POST','/api/archive',{id:lecture.id});assert(!(await api(b,'GET','/api/graph')).nodes.some(n=>n.id===lecture.id));
});
test('correcting captions keeps prepared materials and personal notes; regeneration cannot wipe resources',async()=>{
 const b=browser(),lecture=await api(b,'POST','/api/lectures/from-panopto',{title:'Lecture',segments:[segment(0,0,'Before')],generated:{'resources.md':'Verified bibliography','study-pack.md':'Prepared analysis'}});
 await api(b,'PUT','/api/lectures/'+lecture.id+'/notes',{body:'My own insight'});
 await api(b,'PUT','/api/lectures/'+lecture.id+'/transcript',{segments:[segment(0,0,'Corrected')]});
 let updated=await api(b,'GET','/api/lectures/'+lecture.id);assert.equal(updated.generated['study-pack.md'],'Prepared analysis');assert.equal(updated.my_notes,'My own insight');assert(updated.meta.materials_stale&&updated.meta.caption_reviewed);
 await api(b,'PUT','/api/lectures/'+lecture.id+'/transcript',{segments:[segment(0,0,'Corrected again')],generated:{'study-pack.md':'New draft'}});
 updated=await api(b,'GET','/api/lectures/'+lecture.id);assert.equal(updated.generated['resources.md'],'Verified bibliography');assert(!updated.meta.materials_stale);
});
test('prepared study materials save within the lecture and never replace personal notes',async()=>{
 const b=browser(),lecture=await api(b,'POST','/api/lectures/from-panopto',{title:'Lecture',segments:[segment(0,0,'Source')]});
 await api(b,'PUT','/api/lectures/'+lecture.id+'/notes',{body:'Protected personal notes'});
 await api(b,'PUT','/api/lectures/'+lecture.id+'/materials',{kind:'study-pack',body:'# A prepared pack\n\n[[Retrieval]]'});
 await api(b,'PUT','/api/lectures/'+lecture.id+'/materials',{kind:'explanation',body:'A worked example'});
 const result=await api(b,'GET','/api/lectures/'+lecture.id);assert.equal(result.my_notes,'Protected personal notes');assert(result.generated_html['study-pack.md'].includes('<h1>'));assert(Object.keys(result.generated).some(k=>k.startsWith('explain-')));
 await assert.rejects(()=>api(b,'PUT','/api/lectures/'+lecture.id+'/materials',{kind:'../Source',body:'No'}),/type/);
});
test('untimed pasted text never fabricates a Panopto playback timestamp',async()=>{
 const b=browser(),parsed=b.window.LumenPanopto.parseCaptions('A plain transcript with no measured timestamps.');
 const lecture=await api(b,'POST','/api/lectures/from-panopto',{title:'Plain text',segments:parsed.segments,timed_captions:false,panopto_url:'https://school.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=one'});
 const result=await api(b,'GET','/api/lectures/'+lecture.id);assert.equal(result.chunks[0].link,'');assert.equal(result.chunks[0].time,'Segment 1');
});
test('approximate slide alignment covers the introduction and assigns every caption exactly once',()=>{
 const b=browser(),segments=[segment(7,0,'An introduction before the first match'),segment(12,10,'Encoding details'),segment(20,20,'Retrieval details')],pages=[{page:1,title:'Encoding',text:'Encoding details'},{page:2,title:'Retrieval',text:'Retrieval details'}];
 const chunks=b.window.LumenPanopto.align(pages,segments,true);assert.equal(chunks[0].start,0);assert(chunks[0].segmentIds.includes(7));
 assert.deepEqual([...chunks.flatMap(c=>c.segmentIds)].sort((a,b)=>a-b),[7,12,20]);assert(chunks.every(c=>c.end>c.start&&c.approximate));
});
test('caption parsing sorts cues, skips VTT metadata, and rejects invalid timecodes',()=>{
 const b=browser(),parse=b.window.LumenPanopto.parseCaptions;
 const result=parse('WEBVTT\n\nNOTE this is metadata\nnot spoken\n\n00:00:05.000 --> 00:00:06.000\nLater\n\n00:00:01.000 --> 00:00:02.000\nEarlier');assert.equal(result.segments[0].text,'Earlier');assert.equal(result.segments.length,2);
 assert.throws(()=>parse('WEBVTT\n\n00:99:01.000 --> 00:99:02.000\nInvalid'),/valid caption/);
});
test('invalid caption edits fail atomically and leave the original lecture intact',async()=>{
 const b=browser(),lecture=await api(b,'POST','/api/lectures/from-panopto',{title:'Lecture',segments:[segment(0,0,'Original')]});
 await assert.rejects(()=>api(b,'PUT','/api/lectures/'+lecture.id+'/transcript',{segments:[segment(0,0,'A'),segment(0,2,'B')]}),/duplicate/);
 assert.equal((await api(b,'GET','/api/lectures/'+lecture.id)).meta.segments[0].text,'Original');
});
test('undo history stores only changed records instead of duplicating a large unrelated lecture',async()=>{
 const b=browser();await api(b,'POST','/api/notes',{title:'Long source',body:'a'.repeat(400000)});
 const note=await api(b,'POST','/api/notes',{title:'Small note',body:'One'});
 await api(b,'PUT','/api/notes/'+note.id,{body:'Two'});await api(b,'PUT','/api/notes/'+note.id,{body:'Three'});
 assert(b.localStorage.getItem('lumen.cloud.history.v1').length<15000);
 await api(b,'POST','/api/undo');assert.equal((await api(b,'GET','/api/notes/'+note.id)).body,'Two');
});
test('a quota failure in optional history storage cannot prevent a current note from saving',async()=>{
 const b=browser(),set=b.localStorage.setItem;
 b.localStorage.setItem=(key,value)=>{if(key==='lumen.cloud.history.v1'&&value.length>100)throw Error('History quota');set(key,value)};
 const n=await api(b,'POST','/api/notes',{title:'Still usable',body:'Saved'});
 await api(b,'PUT','/api/notes/'+n.id,{body:'A newer version'});assert.equal((await api(b,'GET','/api/notes/'+n.id)).body,'A newer version');
});
