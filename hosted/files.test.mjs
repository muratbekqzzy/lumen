import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleLectureFiles} from './files.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const id='ab345678-1234-4abc-8def-123456789012',url='https://lumen.example/api/lecture-files/'+id;
const pdf=new TextEncoder().encode('%PDF-1.7\nFixture PDF bytes\n%%EOF');
class Bucket{
 constructor(){this.files=new Map()}
 async head(key){const x=this.files.get(key);return x?{size:x.bytes.length,customMetadata:x.metadata}:null}
 async get(key,options){const x=this.files.get(key),range=options?.range;return x?{size:x.bytes.length,customMetadata:x.metadata,body:range?x.bytes.slice(range.offset,range.offset+range.length):x.bytes}:null}
 async put(key,bytes,options){this.files.set(key,{bytes:new Uint8Array(bytes),metadata:options.customMetadata})}
 async list({prefix}){return {objects:[...this.files].filter(([key])=>key.startsWith(prefix)).map(([key,x])=>({key,size:x.bytes.length})),truncated:false}}
}
function request(method='GET',owner='alice',body,headers={}){return new Request(url,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),...(method==='PUT'?{'Origin':'https://lumen.example','X-Lumen-User':owner,'X-Lumen-Filename':encodeURIComponent('Лекция memory.pdf'),'Content-Type':'application/pdf'}:{}),...headers},body})}
test('PDFs require identity and are isolated between accounts',async()=>{
 const BUCKET=new Bucket();assert.equal((await handleLectureFiles(request('GET',null),{BUCKET})).status,401);
 assert.equal((await handleLectureFiles(request('PUT','alice',pdf),{BUCKET})).status,201);
 assert.equal((await handleLectureFiles(request('GET','bob'),{BUCKET})).status,404);
 const read=await handleLectureFiles(request(),{BUCKET});assert.equal(read.status,200);assert.equal(read.headers.get('Content-Type'),'application/pdf');assert.equal(read.headers.get('Cache-Control'),'no-store, private');assert.deepEqual(new Uint8Array(await read.arrayBuffer()),pdf);
 assert(read.headers.get('Content-Disposition').includes('%D0'));
});
test('PDF retries are idempotent and original bytes cannot be overwritten',async()=>{
 const BUCKET=new Bucket();await handleLectureFiles(request('PUT','alice',pdf),{BUCKET});
 assert.equal((await handleLectureFiles(request('PUT','alice',pdf),{BUCKET})).status,200);
 assert.equal((await handleLectureFiles(request('PUT','alice',new TextEncoder().encode('%PDF-1.7\nDIFFERENT')),{BUCKET})).status,409);assert.equal(BUCKET.files.size,1);
});
test('cross-site uploads and account-switch races are rejected',async()=>{
 const BUCKET=new Bucket();assert.equal((await handleLectureFiles(request('PUT','alice',pdf,{'Origin':'https://evil.example'}),{BUCKET})).status,403);
 assert.equal((await handleLectureFiles(request('PUT','bob',pdf,{'X-Lumen-User':'alice'}),{BUCKET})).status,403);assert.equal(BUCKET.files.size,0);
});
test('unsupported, oversized and invalid PDF uploads fail before storing any object',async()=>{
 const BUCKET=new Bucket();assert.equal((await handleLectureFiles(request('PUT','alice',new TextEncoder().encode('not a PDF')),{BUCKET})).status,415);
 assert.equal((await handleLectureFiles(request('PUT','alice',pdf,{'Content-Length':String(21*1024*1024)}),{BUCKET})).status,413);
 assert.equal((await handleLectureFiles(request('DELETE','alice'),{BUCKET})).status,405);assert.equal(BUCKET.files.size,0);
});
test('unavailable storage fails recoverably and HEAD never returns PDF content',async()=>{
 assert.equal((await handleLectureFiles(request('PUT','alice',pdf),{})).status,503);
 const BUCKET=new Bucket();await handleLectureFiles(request('PUT','alice',pdf),{BUCKET});
 const head=await handleLectureFiles(request('HEAD'),{BUCKET});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('Content-Length'),String(pdf.length));
});
test('per-account storage limits prevent unbounded PDF uploads',async()=>{
 const BUCKET=new Bucket();BUCKET.list=async()=>({objects:[{size:500*1024*1024}],truncated:false});
 assert.equal((await handleLectureFiles(request('PUT','alice',pdf),{BUCKET})).status,413);assert.equal(BUCKET.files.size,0);
});
test('PDF readers can request normal and suffix ranges; invalid ranges return 416',async()=>{
 const BUCKET=new Bucket();await handleLectureFiles(request('PUT','alice',pdf),{BUCKET});
 for(const [range,offset,length] of [['bytes=0-4',0,5],['bytes=-5',pdf.length-5,5],['bytes=8-',8,pdf.length-8]]){
  const read=await handleLectureFiles(request('GET','alice',undefined,{Range:range}),{BUCKET});assert.equal(read.status,206);assert.equal(read.headers.get('Content-Range'),`bytes ${offset}-${offset+length-1}/${pdf.length}`);assert.deepEqual(new Uint8Array(await read.arrayBuffer()),pdf.slice(offset,offset+length));
 }
 for(const range of ['bytes=9999-','bytes=8-2','bytes=-0','bytes=0-1,4-6'])assert.equal((await handleLectureFiles(request('GET','alice',undefined,{Range:range}),{BUCKET})).status,416);
});
