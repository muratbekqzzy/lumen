import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handleSync,handleMaterialImport} from './sync.mjs';
class Database {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));}
  prepare(sql){const db=this.db;return {sql,args:[],bind(...args){return {...this,args}},async all(){return {results:db.prepare(sql).all(...this.args)}}};}
  async batch(statements){this.db.exec('BEGIN IMMEDIATE');try{const result=statements.map(({sql,args})=>/RETURNING\s+revision/.test(sql)?{results:this.db.prepare(sql).all(...args)}:{results:[],meta:this.db.prepare(sql).run(...args)});this.db.exec('COMMIT');return result}catch(error){this.db.exec('ROLLBACK');throw error}}
}
const origin='https://lumen.example',token='a-long-temporary-secret-for-this-test-only';
const materials={'study-pack.md':'# New study pack\n\n```quiz\n{"questions":[]}\n```','flashcards.md':'Q: Explain causal inference.\nA: Compare equivalent groups.','explanation.md':'# Explanation\n\nТест with supplementary example.'};
const payload=JSON.stringify({materials}),hash=value=>createHash('sha256').update(value).digest('hex');
function state(){return {version:1,deleted:{},records:Object.fromEntries([
  ...['root','inbox','archive'].map(id=>({id,kind:id,parent:null,title:id,created:0,updated:0})),
  {id:'course',kind:'module',title:'PSYC 1142',parent:'root',created:1,updated:1},
  {id:'lecture',kind:'lecture',title:'Lecture 01: Research design',parent:'course',created:1,updated:1,
   body:'My private notes',segments:[{id:0,start:0,end:1,text:'Original transcript'}],source_pdf:{id:'original'},
   generated:{'study-pack.md':'Old pack','flashcards.md':'Old cards','resources.md':'Keep references','explain-existing.md':'Keep previous explanation'}},
  {id:'other-course',kind:'module',title:'PSYC 1143',parent:'root',created:1,updated:1},
  {id:'other-lecture',kind:'lecture',title:'Lecture 01',parent:'other-course',created:1,updated:1,body:'Other course'}
].map(node=>[node.id,node]))};}
async function put(env,library,baseRevision,owner='alice'){
 const result=await handleSync(new Request(origin+'/api/sync',{method:'PUT',headers:{'Content-Type':'application/json','oai-authenticated-user-id':owner},body:JSON.stringify({userId:owner,baseRevision,state:library})}),env);
 assert.equal(result.status,200);return result.json();
}
async function snapshot(env,owner='alice'){return (await handleSync(new Request(origin+'/api/sync',{headers:{'oai-authenticated-user-id':owner}}),env)).json();}
async function setup(){const env={DB:new Database(),LUMEN_MATERIAL_IMPORT_TOKEN:token};env.permit={owner:'alice',courseId:'course',courseTitle:'PSYC 1142',lectureNumber:1,batchId:'1234567890abcdef1234567890abcdef',bodySHA256:hash(payload),expiresAt:Date.now()+3600000};env.LUMEN_MATERIAL_IMPORT_PERMIT=JSON.stringify(env.permit);await put(env,state(),0);return env;}
function request(action='apply',body=payload,headers={}){return new Request(origin+'/api/maintenance/lecture-materials',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Lumen-Import-Action':action,...headers},body});}
test('material import stays disabled without a valid unexpired scoped permit and secret',async()=>{
 const env=await setup();
 for(const altered of [{...env,LUMEN_MATERIAL_IMPORT_TOKEN:undefined},{...env,LUMEN_MATERIAL_IMPORT_PERMIT:undefined},{...env,LUMEN_MATERIAL_IMPORT_PERMIT:JSON.stringify({...env.permit,expiresAt:1})}])assert.equal((await handleMaterialImport(request(),altered)).status,404);
 assert.equal((await handleMaterialImport(request('apply',payload,{Authorization:'Bearer wrong'}),env)).status,404);assert.equal((await snapshot(env)).revision,1);
});
test('preview identifies the unique lecture and performs no library mutation',async()=>{
 const env=await setup(),before=await snapshot(env),response=await handleMaterialImport(request('preview'),env),preview=await response.json();
 assert.equal(response.status,200);assert.equal(preview.lecture.id,'lecture');assert.equal(preview.course.id,'course');assert.equal(preview.files.length,3);assert.equal(preview.files[2].bytes,Buffer.byteLength(materials['explanation.md']));assert.deepEqual(await snapshot(env),before);
});
test('three materials commit atomically while notes, sources, resources and other accounts remain unchanged',async()=>{
 const env=await setup();await put(env,state(),0,'bob');const before=await snapshot(env),bob=await snapshot(env,'bob');
 const response=await handleMaterialImport(request(),env),result=await response.json();assert.equal(response.status,200);assert(result.verified);
 const after=await snapshot(env),lecture=after.state.records.lecture;assert.equal(after.revision,2);
 assert.equal(lecture.generated['study-pack.md'],materials['study-pack.md']);assert.equal(lecture.generated['flashcards.md'],materials['flashcards.md']);assert.equal(lecture.generated[result.files[2].saved_as],materials['explanation.md']);
 for(const key of ['body','segments','source_pdf'])assert.deepEqual(lecture[key],before.state.records.lecture[key]);
 for(const name of ['resources.md','explain-existing.md'])assert.equal(lecture.generated[name],before.state.records.lecture.generated[name]);
 assert.equal(lecture.material_imports[0].previous_materials['study-pack.md'],'Old pack');assert.equal(lecture.generated_source,'prepared');assert.deepEqual(after.state.records['other-lecture'],before.state.records['other-lecture']);assert.deepEqual(await snapshot(env,'bob'),bob);
 assert((await (await handleMaterialImport(request('verify'),env)).json()).verified);
});
test('repeated imports never overwrite subsequent edits or add duplicate explanations',async()=>{
 const env=await setup();await handleMaterialImport(request(),env);const first=await snapshot(env);await handleMaterialImport(request(),env);assert.deepEqual(await snapshot(env),first);
 first.state.records.lecture.generated['study-pack.md']='My later revision';first.state.records.lecture.updated++;await put(env,first.state,first.revision);
 const response=await (await handleMaterialImport(request(),env)).json();assert(response.already_applied);assert.equal(response.verified,false);assert.equal((await snapshot(env)).state.records.lecture.generated['study-pack.md'],'My later revision');
});
test('changed bodies, cross-site requests and ambiguous or renamed targets cannot write',async()=>{
 const env=await setup();assert.equal((await handleMaterialImport(request('apply',payload+' '),env)).status,403);assert.equal((await handleMaterialImport(request('apply',payload,{Origin:'https://evil.example'}),env)).status,403);assert.equal((await snapshot(env)).revision,1);
 const altered={...env,LUMEN_MATERIAL_IMPORT_PERMIT:JSON.stringify({...env.permit,courseTitle:'Wrong course'})};assert.equal((await handleMaterialImport(request(),altered)).status,409);
 const current=await snapshot(env);current.state.records.duplicate={...current.state.records.lecture,id:'duplicate'};await put(env,current.state,current.revision);assert.equal((await handleMaterialImport(request(),env)).status,409);assert.equal((await snapshot(env)).revision,2);
});
test('an import retries a revision race and preserves the newer device edit',async()=>{
 const env=await setup(),batch=env.DB.batch.bind(env.DB);let raced=false;
 env.DB.batch=async statements=>{if(!raced){raced=true;const current=await snapshot(env);current.state.records.lecture.body='Newer device notes';current.state.records.lecture.updated++;await put(env,current.state,current.revision);}return batch(statements);};
 const response=await handleMaterialImport(request(),env);assert.equal(response.status,200);const current=await snapshot(env);assert.equal(current.revision,3);assert.equal(current.state.records.lecture.body,'Newer device notes');assert.equal(current.state.records.lecture.generated['study-pack.md'],materials['study-pack.md']);
});
