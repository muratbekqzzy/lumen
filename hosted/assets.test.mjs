import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('published Worker preserves PDF binary assets and protects original file routes',async()=>{
 await import('./build.mjs');
 const {default:worker}=await import('../dist/server/index.js');
 for(const file of ['web/pdfjs/wasm/openjpeg.wasm','web/pdfjs/standard_fonts/FoxitFixed.pfb','web/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap']){
  const response=await worker.fetch(new Request('https://lumen.example/'+file),{});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(file));
  if(file.endsWith('.wasm'))assert.equal(response.headers.get('Content-Type'),'application/wasm');
 }
 for(const file of ['web/pdf.js','web/tutor.js','web/pdfjs/pdf.mjs','web/pdfjs/pdf.worker.mjs']){
  const response=await worker.fetch(new Request('https://lumen.example/'+file),{});assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/javascript/);
 }
 const privateFile=await worker.fetch(new Request('https://lumen.example/api/lecture-files/ab345678-1234-4abc-8def-123456789012'),{});assert.equal(privateFile.status,401);
});
