/* Lumen: Panopto captions -> structured, editable, slide-linked learning material.
   Works entirely in the browser. Private Panopto URLs cannot be fetched across origins;
   import caption export (.srt/.vtt/.txt) rather than asking for login credentials. */
(()=>{"use strict";
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sec=s=>{const a=String(s).replace(",",".").trim().split(":").map(Number);return a.reduce((v,t)=>v*60+t,0)};
const fmt=s=>{s=Math.max(0,Math.floor(s));return (s>=3600?Math.floor(s/3600)+":":"")+String(Math.floor(s%3600/60)).padStart(s>=3600?2:1,"0")+":"+String(s%60).padStart(2,"0")};
const clean=s=>s.replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
const normal=s=>s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>3&&!["this","that","they","with","from","what","when","have","were","been","will","could","would","about","there","their"].includes(w));
const validateUrl=u=>{if(!u)return "";let url;try{url=new URL(u)}catch{throw Error("Enter a valid Panopto URL")};if(url.protocol!=="https:")throw Error("Panopto URL must use HTTPS");if(!/(^|\.)panopto\.(com|eu)$/.test(url.hostname)&&!url.hostname.includes("panopto"))throw Error("This does not appear to be a Panopto URL");return url.href};
function parseCaptions(raw, filename=""){
 raw=String(raw||"").replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
 const lines=raw.split("\n"), cues=[];let i=0;
 while(i<lines.length){
   let line=lines[i].trim();
   if(!line||line==="WEBVTT"||line.startsWith("NOTE")){i++;continue}
   if(/^\d+$/.test(line)&&i+1<lines.length&&lines[i+1].includes("-->")){i++;line=lines[i].trim()}
   if(line.includes("-->")){
     const m=line.match(/((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/);
     if(m){i++;const buffer=[];while(i<lines.length&&lines[i].trim()){buffer.push(lines[i]);i++}
       const text=clean(buffer.join(" "));if(text){const start=sec(m[1]),end=sec(m[2]);if(end>=start)cues.push({start,end,text})}
       continue}
   }i++;
 }
 if(cues.length){const unique=[];for(const c of cues){const prev=unique[unique.length-1];if(prev&&prev.text===c.text&&c.start<=prev.end+0.25){prev.end=Math.max(prev.end,c.end)}else unique.push(c)}return {segments:unique.map((s,id)=>({...s,id})),timed:true,source:filename||"Timed captions"}}
 const stripped=raw.replace(/^(WEBVTT|\d+)\s*$/gm,"").trim();
 if(!stripped)throw Error("Caption file contains no readable transcript");
 const paragraphs=stripped.split(/\n\s*\n/).map(clean).filter(Boolean);
 const blocks=paragraphs.length>1?paragraphs:stripped.split(/(?<=[.!?])\s+(?=[A-Z])/).map(clean).filter(Boolean);
 let start=0;return {timed:false,source:filename||"Untimed transcript",segments:blocks.map((text,id)=>{const end=start+Math.max(4,Math.ceil(text.split(/\s+/).length/2.6));const row={id,start,end,text,untimed:true};start=end;return row})};
}
async function pdfPages(file){
 if(!file)return [];
 const url="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
 try{
   const pdfjs=await import(url);pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
   const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
   if(doc.numPages>300)throw Error("PDF is too long (300-page limit)");
   const pages=[];
   for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),text=await p.getTextContent();const lines=text.items.map(x=>x.str).filter(Boolean),joined=lines.join(" ");pages.push({page:i,title:lines.find(x=>x.trim().length>3)?.trim().slice(0,140)||"Slide "+i,text:joined.slice(0,16000)})}
   return pages;
 }catch(err){throw Error("Could not read slides PDF: "+err.message+". Try uploading a text-based PDF or importing captions without slides.")}
}
function align(pages,segments,timed){
 const duration=Math.max(segments.at(-1)?.end||0,1);
 if(!pages.length){return [{n:1,page:null,title:"Transcript",start:0,end:duration,not_in_pdf:false,segmentIds:segments.map(s=>s.id),slide_text:""}]}
 const taken=new Set();const boundaries=[];
 for(const p of pages){
  const terms=new Set(normal(p.title+" "+p.text));let best=-1,score=0;
  for(let j=0;j<segments.length;j++){if(taken.has(j))continue;const seg=new Set(normal(segments[j].text));const overlap=[...seg].filter(x=>terms.has(x)).length;const hit=overlap/Math.max(1,seg.size);if(hit>score){score=hit;best=j}}
  if(score>0.16&&best>=0){boundaries.push({page:p,start:segments[best].start,score});taken.add(best)}
 }
 // When no trustworthy slide events are available, do not invent exact slide timings.
 // Use sequential approximate sections; labels and status tell the user these are estimates.
 const markers=pages.map((p,i)=>({page:p,start:duration*i/pages.length,end:duration*(i+1)/pages.length,score:0,approximate:true}));
 let use=markers;
 if(timed&&boundaries.length>=2){
  boundaries.sort((a,b)=>a.start-b.start);
  const monotonic=boundaries.every((b,i)=>i===0||b.page.page>=boundaries[i-1].page.page);
  if(monotonic){
   use=pages.map((p,i)=>{const matched=boundaries.find(x=>x.page.page===p.page);return {page:p,start:matched?.start??duration*i/pages.length,end:duration*(i+1)/pages.length,score:matched?.score??0,approximate:true}}).sort((a,b)=>a.page.page-b.page.page);
   for(let i=1;i<use.length;i++)use[i].start=Math.max(use[i-1].start+0.001,use[i].start);
  }
 }
 const chunks=use.map((m,i)=>({n:i+1,page:m.page.page,title:m.page.title,start:m.start,end:i+1<use.length?use[i+1].start:duration,segmentIds:[],slide_text:m.page.text,approximate:true}));
 for(const seg of segments){const midpoint=(seg.start+seg.end)/2;let c=chunks.find(c=>midpoint>=c.start&&midpoint<c.end)||chunks.at(-1);c.segmentIds.push(seg.id)}
 return chunks;
}
function makePack(title,segments,pages,chunks,timed,corrections=false){
 const txt=segments.map(s=>s.text).join(" ").replace(/\s+/g," ").trim();
 const intro=["# "+title,"","_Organised from Panopto captions. This is an extractive study outline, not AI-verified lecture notes._","",
   timed?"Timed captions imported.":"The downloaded transcript had no timestamps; slide placement is estimated.",
   "","## Lecture overview",txt.slice(0,1100)+(txt.length>1100?"…":""),""];
 const flash=["# Flashcards","", "_Draft review questions from slide headings. Check the answers against your lecture._",""];
 for(const c of chunks){
   const speech=c.segmentIds.map(i=>segments[i]?.text||"").join(" ").trim();
   intro.push("## "+(c.page?"Slide "+c.page+": ":"")+c.title,"",c.slide_text?"**On the slide:** "+c.slide_text.slice(0,900):"",speech?speech.slice(0,2400):"_No caption text assigned to this slide._","")
   if(c.page&&speech){flash.push("Q: What was explained on slide "+c.page+" (“"+c.title+"”)?","A: "+speech.slice(0,350)+(speech.length>350?"…":""),"")}
 }
 intro.push("## Check your understanding","", "1. Which three ideas were most important in this lecture?","2. Where did the lecturer add nuance beyond the slides?","3. What would you need to revise before an exam?","", "_Correct the captions in Lumen if any terms are wrong; regenerating the pack will update it._");
 return {"study-pack.md":intro.join("\n"),"flashcards.md":flash.join("\n"),"resources.md":"# Further resources\n\nAdd lecturer-recommended references or verified sources here.\n"};
}
function modalShell(title,inner){document.getElementById("lumen-panopto-dialog")?.remove();
 const d=document.createElement("div");d.id="lumen-panopto-dialog";
 d.innerHTML='<div class="lumen-panopto-panel" role="dialog" aria-modal="true" aria-label="'+escape(title)+'"><button type="button" class="lumen-panopto-close" aria-label="Close">×</button><h2>'+escape(title)+'</h2>'+inner+'</div>';
 document.body.append(d);d.querySelector(".lumen-panopto-close").onclick=()=>d.remove();return d}
const style=document.createElement("style");style.textContent=`
#lumen-panopto-dialog{position:fixed;z-index:10100;inset:0;background:#000b;display:flex;justify-content:center;align-items:center;padding:16px}
.lumen-panopto-panel{position:relative;box-sizing:border-box;background:#1d202a;color:#e7e8ed;border:1px solid #485164;border-radius:18px;padding:22px;width:min(780px,100%);max-height:95vh;overflow:auto;font:14px/1.55 system-ui}
.lumen-panopto-panel h2{font-size:21px;margin:0 0 9px}.lumen-panopto-panel p{color:#bdc3d0}
.lumen-panopto-panel label{display:block;margin:12px 0 3px}
.lumen-panopto-panel input,.lumen-panopto-panel textarea{box-sizing:border-box;width:100%;display:block;color:#fafafa;background:#121721;border:1px solid #5a6275;border-radius:8px;padding:10px;font:inherit}
.lumen-panopto-panel textarea{min-height:95px}
.lumen-panopto-panel button:not(.lumen-panopto-close){background:#c4d7ff;color:#151923;border-radius:8px;padding:9px 14px;cursor:pointer;margin:10px 7px 0 0;font:inherit}
.lumen-panopto-panel a{color:#a8cbff}.lumen-panopto-close{position:absolute;right:14px;top:12px;background:none;color:inherit;border:none;font-size:26px;cursor:pointer}
.lumen-panopto-rows{max-height:45vh;overflow:auto}.lumen-panopto-rows label{padding:9px;border-bottom:1px solid #3a4050}
.lumen-panopto-rows textarea{min-height:58px}
.lumen-panopto-message{font-size:13px;color:#ffc38c!important}
`;document.head.append(style);
function open(parent){
const d=modalShell("Import a Panopto lecture",`<p>Paste the original lecture link, then provide Panopto's caption export. Lumen will use the existing captions rather than re-transcribing with Whisper. You can correct them after import, attach PDF slides and build a study pack.</p>
<form id="panopto-import">
<label>Lecture title<input required name="title" placeholder="e.g. Week 6 — Prospective memory"></label>
<label>Panopto recording link<input required type="url" name="url" placeholder="https://…panopto…/Panopto/Pages/Viewer.aspx?id=…"></label>
<label>Panopto captions (.vtt, .srt or .txt)<input type="file" name="captions" accept=".txt,.vtt,.srt,text/plain,text/vtt" required></label>
<label>Lecture slides (PDF, optional)<input type="file" name="slides" accept="application/pdf,.pdf"></label>
<p>To download captions: open Panopto → Captions → Download transcript. For timestamped captions, use the caption-file export if available. Panopto login stays in Panopto; do not enter your password here.</p>
<button type="submit">Structure lecture and save</button>
<p id="panopto-import-status" class="lumen-panopto-message" role="status"></p></form>`);
d.querySelector("form").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,submit=form.querySelector("button"),status=d.querySelector("#panopto-import-status");submit.disabled=true;
 try{const f=new FormData(form),url=validateUrl(String(f.get("url")||"")),captions=f.get("captions"),pdf=f.get("slides");if(!(captions instanceof File)||!captions.size)throw Error("Choose your Panopto caption file");
 status.textContent="Reading Panopto captions…";const parsed=parseCaptions(await captions.text(),captions.name);
 status.textContent="Extracting slide text…";const pages=pdf&&pdf.size?await pdfPages(pdf):[];
 status.textContent="Building structure and study pack…";const chunks=align(pages,parsed.segments,parsed.timed),title=String(f.get("title")||"Lecture").trim();
 const generated=makePack(title,parsed.segments,pages,chunks,parsed.timed);
 const data={parent_id:parent.id,title,panopto_url:url,segments:parsed.segments,chunks,generated,slide_count:pages.length,duration:Math.ceil(parsed.segments.at(-1).end),caption_source:parsed.source,timed_captions:parsed.timed,alignment_estimated:!!pages.length,caption_reviewed:false};
 const r=await fetch("/api/lectures/from-panopto",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 const result=await r.json();if(!r.ok)throw Error(result.detail||"Import failed");
 status.textContent="Saved to this browser. GitHub sync will start if connected.";d.remove();location.hash="#/lecture/"+result.id;window.dispatchEvent(new Event("hashchange"));
 }catch(err){status.textContent=err.message||String(err)}finally{submit.disabled=false}};
}
async function edit(id){
let response=await fetch("/api/lectures/"+encodeURIComponent(id));const bundle=await response.json();if(!response.ok)throw Error(bundle.detail||"Lecture unavailable");
const old=bundle.meta,segments=(old.segments||[]).map(s=>({...s}));if(!segments.length){alert("No captions available for this lecture.");return}
const d=modalShell("Review Panopto captions",`<p>Review technical vocabulary and transcription errors. Edits are saved with your lecture and automatically synchronized when GitHub sync is connected. Slide timing remains estimated unless genuine slide-change timing is provided.</p>
<div class="lumen-panopto-rows">${segments.map((s,i)=>`<label><strong>${s.untimed?"Segment "+(i+1):fmt(s.start)+" – "+fmt(s.end)}</strong><textarea data-i="${i}">${escape(s.text)}</textarea></label>`).join("")}</div>
<button id="panopto-save-corrections">Save corrections and rebuild pack</button><p class="lumen-panopto-message" id="panopto-edit-status" role="status"></p>`);
d.querySelector("#panopto-save-corrections").onclick=async e=>{const btn=e.currentTarget,msg=d.querySelector("#panopto-edit-status");btn.disabled=true;try{
 d.querySelectorAll("textarea[data-i]").forEach(el=>{segments[+el.dataset.i].text=el.value.trim()});
 if(segments.some(s=>!s.text))throw Error("Caption segments cannot be blank");
 const chunks=old.chunks||[];
 const pages=chunks.filter(c=>c.page).map(c=>({page:c.page,title:c.title,text:c.slide_text||""}));
 const generated={...(old.generated||{}),...makePack(old.title,segments,pages,chunks,old.timed_captions||false,true)};
 const r=await fetch("/api/lectures/"+encodeURIComponent(id)+"/transcript",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({segments,chunks,generated})});const x=await r.json();if(!r.ok)throw Error(x.detail||"Could not save");
 d.remove();window.dispatchEvent(new Event("hashchange"));
 }catch(err){msg.textContent=err.message||String(err)}finally{btn.disabled=false}};
}
window.LumenPanopto={open,edit,parseCaptions,align,makePack};
})();