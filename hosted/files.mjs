/* Private original lecture PDFs. Library sync stores references, not Base64 files. */
const PDF_LIMIT=20*1024*1024;
const PDF_ACCOUNT_LIMIT=500*1024*1024;
const PDF_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function pdfJSON(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}})}
async function pdfReadBody(request){
 if(Number(request.headers.get('Content-Length')||0)>PDF_LIMIT)throw Object.assign(Error('Choose a PDF smaller than 20 MiB.'),{status:413});
 if(!request.body)throw Object.assign(Error('Choose a PDF file.'),{status:400});
 const reader=request.body.getReader(),parts=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>PDF_LIMIT){await reader.cancel();throw Object.assign(Error('Choose a PDF smaller than 20 MiB.'),{status:413})}parts.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
 if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))throw Object.assign(Error('This file does not appear to be a PDF.'),{status:415});
 return bytes;
}
export async function handleLectureFiles(request,env){
 try{
  const owner=request.headers.get('oai-authenticated-user-id');if(!owner||owner.length>512)return pdfJSON({detail:'Sign in to access your lecture slides.'},401);
  const url=new URL(request.url),id=url.pathname.split('/').pop();if(!PDF_UUID.test(id))return pdfJSON({detail:'Invalid PDF reference.'},400);
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin))return pdfJSON({detail:'Cross-origin file access is not allowed.'},403);
  if(!env.BUCKET)return pdfJSON({detail:'PDF storage is not ready. Your local copy is kept on this device.'},503);
  const prefix='lecture-pdfs/'+encodeURIComponent(owner)+'/',key=prefix+id+'.pdf';
  if(request.method==='PUT'){
   const expected=request.headers.get('X-Lumen-User');if(expected!==owner)return pdfJSON({detail:'Your account changed. Reopen the lecture before attaching slides.'},403);
   const bytes=await pdfReadBody(request),digest=await crypto.subtle.digest('SHA-256',bytes),sha=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
   const previous=await env.BUCKET.head(key);
   if(previous){if(previous.customMetadata?.sha256!==sha)return pdfJSON({detail:'This original PDF already exists and cannot be overwritten.'},409);return pdfJSON({id,size:previous.size,name:decodeURIComponent(previous.customMetadata?.filename||'slides.pdf')})}
   const listing=await env.BUCKET.list({prefix,limit:301}),objects=listing.objects||[];
   if(objects.length>=300||listing.truncated||objects.reduce((sum,x)=>sum+x.size,0)+bytes.byteLength>PDF_ACCOUNT_LIMIT)return pdfJSON({detail:'Your PDF storage is full. Your local PDF is kept; export a copy before clearing browser data.'},413);
   let filename;try{filename=decodeURIComponent(request.headers.get('X-Lumen-Filename')||'slides.pdf')}catch{return pdfJSON({detail:'Invalid file name.'},400)}
   filename=filename.split(/[\\/]/).pop().replace(/[\r\n\x00-\x1f]/g,'').slice(0,200)||'slides.pdf';
   await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/pdf'},customMetadata:{sha256:sha,filename:encodeURIComponent(filename)}});
   return pdfJSON({id,size:bytes.byteLength,name:filename},201);
  }
  if(!['GET','HEAD'].includes(request.method))return pdfJSON({detail:'Use GET, HEAD or PUT.'},405);
  const range=request.method==='HEAD'?null:request.headers.get('Range');let requestedRange;
  if(range){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2]))return pdfJSON({detail:'Invalid PDF byte range.'},416);
   const head=await env.BUCKET.head(key);if(!head)return pdfJSON({detail:'This PDF is not available in your account. Attach the original file again.'},404);
   const offset=match[1]?Number(match[1]):Math.max(0,head.size-Number(match[2]));
   const end=match[1]&&match[2]?Math.min(head.size-1,Number(match[2])):head.size-1;
   if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(end)||offset>=head.size||offset>end)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+head.size,'Cache-Control':'no-store, private'}});
   requestedRange={offset,length:end-offset+1};
  }
  const object=request.method==='HEAD'?await env.BUCKET.head(key):await env.BUCKET.get(key,requestedRange?{range:requestedRange}:undefined);
  if(!object)return pdfJSON({detail:'This PDF is not available in your account. Attach the original file again.'},404);
  const filename=object.customMetadata?.filename||'slides.pdf';
  const headers={'Content-Type':'application/pdf','Content-Disposition':"inline; filename=\"slides.pdf\"; filename*=UTF-8''"+filename,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Accept-Ranges':'bytes'};
  if(requestedRange){headers['Content-Range']=`bytes ${requestedRange.offset}-${requestedRange.offset+requestedRange.length-1}/${object.size}`;headers['Content-Length']=String(requestedRange.length)}else headers['Content-Length']=String(object.size);
  return new Response(request.method==='HEAD'?null:object.body,{status:requestedRange?206:200,headers});
 }catch(error){return pdfJSON({detail:error.status?error.message:'Could not store or retrieve the PDF. Your local copy is kept.'},error.status||503)}
}
