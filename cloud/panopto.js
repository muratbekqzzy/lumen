/* Lumen: Panopto captions -> structured, editable, slide-linked learning material.
   Works entirely in the browser. Private Panopto URLs cannot be fetched across origins;
   import caption export (.srt/.vtt/.txt) rather than asking for login credentials. */
(()=>{"use strict";
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sec=s=>{const a=String(s).replace(",",".").trim().split(":").map(Number);return a.some(x=>!Number.isFinite(x)||x<0)||a.slice(-2).some(x=>x>=60)?NaN:a.reduce((v,t)=>v*60+t,0)};
const fmt=s=>{s=Math.max(0,Math.floor(s));return (s>=3600?Math.floor(s/3600)+":":"")+String(Math.floor(s%3600/60)).padStart(s>=3600?2:1,"0")+":"+String(s%60).padStart(2,"0")};
const clean=s=>s.replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
const normal=s=>s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>3&&!["this","that","they","with","from","what","when","have","were","been","will","could","would","about","there","their"].includes(w));
const validateUrl=u=>{if(!u)return "";let url;try{url=new URL(u)}catch{throw Error("Enter a valid Panopto URL")};if(url.protocol!=="https:")throw Error("Panopto URL must use HTTPS");if(!/(^|\.)panopto\.(com|eu)$/.test(url.hostname)&&!url.hostname.includes("panopto"))throw Error("This does not appear to be a Panopto URL");return url.href};
function parseCaptions(raw, filename=""){
 raw=String(raw||"").replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
 const lines=raw.split("\n"), cues=[];let i=0;
 while(i<lines.length){
   let line=lines[i].trim();
   if(!line||/^WEBVTT(?:\s|$)/.test(line)){i++;continue}
   if(/^(NOTE|STYLE|REGION)(?:\s|$)/.test(line)){while(i<lines.length&&lines[i].trim())i++;continue}
   if(/^\d+$/.test(line)&&i+1<lines.length&&lines[i+1].includes("-->")){i++;line=lines[i].trim()}
   if(line.includes("-->")){
     const m=line.match(/((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/);
     if(m){i++;const buffer=[];while(i<lines.length&&lines[i].trim()){buffer.push(lines[i]);i++}
       const text=clean(buffer.join(" "));if(text){const start=sec(m[1]),end=sec(m[2]);if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start)cues.push({start,end,text})}
       continue}
   }i++;
 }
 if(cues.length){cues.sort((a,b)=>a.start-b.start||a.end-b.end);const unique=[];for(const c of cues){const prev=unique[unique.length-1];if(prev&&prev.text===c.text&&c.start<=prev.end+0.25){prev.end=Math.max(prev.end,c.end)}else unique.push(c)}return {segments:unique.map((s,id)=>({...s,id})),timed:true,source:filename||"Timed captions"}}
 if(raw.includes("-->")||/^WEBVTT/m.test(raw))throw Error("No valid caption timings found. Check the VTT/SRT export, or paste plain transcript text instead.");
 const stripped=raw.replace(/^(WEBVTT|\d+)\s*$/gm,"").trim();
 if(!stripped)throw Error("Caption file contains no readable transcript");
 const paragraphs=stripped.split(/\n\s*\n/).map(clean).filter(Boolean);
 const blocks=paragraphs.length>1?paragraphs:stripped.split(/(?<=[.!?])\s+(?=[A-Z])/).map(clean).filter(Boolean);
 let start=0;return {timed:false,source:filename||"Untimed transcript",segments:blocks.map((text,id)=>{const end=start+Math.max(4,Math.ceil(text.split(/\s+/).length/2.6));const row={id,start,end,text,untimed:true};start=end;return row})};
}
async function pdfPages(file){
 if(!file)return [];
 const url="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";let doc;
 try{
   const pdfjs=await import(url);pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
   doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
   if(doc.numPages>300)throw Error("PDF is too long (300-page limit)");
   const pages=[];
   for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),text=await p.getTextContent();const lines=text.items.map(x=>x.str).filter(Boolean),joined=lines.join(" ");pages.push({page:i,title:lines.find(x=>x.trim().length>3)?.trim().slice(0,140)||"Slide "+i,text:joined.slice(0,16000)})}
   if(pages.every(p=>!p.text.trim()))throw Error("This PDF has no selectable text (it may need OCR)");
   return pages;
 }catch(err){throw Error("Could not read slides PDF: "+err.message+". Try uploading a text-based PDF or importing captions without slides.")}finally{try{await doc?.destroy()}catch{}}
}
function align(pages,segments,timed){
 const duration=segments.reduce((end,x)=>Math.max(end,x.end),1);
 if(!pages.length){
  const groups=[];let current=null,words=0;
  for(const segment of segments){const count=segment.text.split(/\s+/).length;if(!current||(words>=350)||(timed&&segment.start-current.start>=240)){current={n:groups.length+1,page:null,title:"Part "+(groups.length+1),start:segment.start,end:segment.end,not_in_pdf:false,segmentIds:[],slide_text:""};groups.push(current);words=0}current.segmentIds.push(segment.id);current.end=Math.max(current.end,segment.end);words+=count}
  return groups;
 }
 const taken=new Set(),boundaries=[];
 for(const page of pages){
  const terms=new Set(normal(page.title+" "+page.text));let best=-1,score=0;
  for(let i=0;i<segments.length;i++){if(taken.has(i))continue;const words=new Set(normal(segments[i].text)),overlap=[...words].filter(x=>terms.has(x)).length,hit=overlap/Math.max(1,words.size);if(hit>score){score=hit;best=i}}
  if(score>.16&&best>=0){boundaries.push({page:page.page,start:segments[best].start});taken.add(best)}
 }
 const ordered=[...boundaries].sort((a,b)=>a.start-b.start),monotonic=ordered.every((x,i)=>i===0||x.page>=ordered[i-1].page);
 const step=duration/pages.length,epsilon=Math.min(.001,step*.01);
 const markers=pages.map((page,i)=>({page,start:timed&&monotonic&&boundaries.length>=2?(boundaries.find(x=>x.page===page.page)?.start??step*i):step*i}));
 markers[0].start=0;
 for(let i=1;i<markers.length;i++)markers[i].start=Math.min(duration-(markers.length-i)*epsilon,Math.max(markers[i-1].start+epsilon,markers[i].start));
 const chunks=markers.map((m,i)=>({n:i+1,page:m.page.page,title:m.page.title,start:m.start,end:i+1<markers.length?markers[i+1].start:duration,segmentIds:[],slide_text:m.page.text,approximate:true}));
 for(const seg of segments){const midpoint=(seg.start+seg.end)/2;const chunk=chunks.find(c=>midpoint>=c.start&&midpoint<c.end)||chunks.at(-1);chunk.segmentIds.push(seg.id)}
 return chunks;
}
function makePack(title,segments,pages,chunks,timed,corrections=false){
 const byId=new Map(segments.map(segment=>[segment.id,segment]));
 const txt=segments.map(s=>s.text).join(" ").replace(/\s+/g," ").trim();
 const intro=["# "+title,"","_Organised from Panopto captions. This is an extractive study outline, not AI-verified lecture notes._","",
   timed?"Timed captions imported.":"The downloaded transcript had no timestamps; slide placement is estimated.",
   "","## Lecture overview",txt.slice(0,1100)+(txt.length>1100?"…":""),""];
 const flash=["# Flashcards","", "_Draft review questions from slide headings. Check the answers against your lecture._",""];
 for(const c of chunks){
   const speech=c.segmentIds.map(i=>byId.get(i)?.text||"").join(" ").trim();
   intro.push("## "+(c.page?"Slide "+c.page+": ":"")+c.title,"",c.slide_text?"**On the slide:** "+c.slide_text.slice(0,900):"",speech?(speech.slice(0,2400)+(speech.length>2400?"… [Excerpt: read the full source in Slides & transcript.]":"")):"_No caption text assigned to this slide._","")
   if(speech){flash.push("Q: What was explained in "+(c.page?"slide "+c.page+" (“"+c.title+"”)":c.title)+"?","A: "+speech.slice(0,350)+(speech.length>350?"… [Read the full transcript to check.]":""),"")}
 }
 intro.push("## Check your understanding","", "1. Which three ideas were most important in this lecture?","2. Where did the lecturer add nuance beyond the slides?","3. What would you need to revise before an exam?","", "_Correct the captions in Lumen if any terms are wrong; regenerating the pack will update it._");
 return {"study-pack.md":intro.join("\n"),"flashcards.md":flash.join("\n")};
}
function modalShell(title,inner){document.getElementById("lumen-panopto-dialog")?.remove();
 const d=document.createElement("div");d.id="lumen-panopto-dialog";
 d.innerHTML='<div class="lumen-panopto-panel" role="dialog" aria-modal="true" aria-label="'+escape(title)+'"><button type="button" class="lumen-panopto-close" aria-label="Close">×</button><h2>'+escape(title)+'</h2>'+inner+'</div>';
 document.body.append(d);d.querySelector(".lumen-panopto-close").onclick=()=>d.remove();return d}
const style=document.createElement("style");style.textContent=`
#lumen-panopto-dialog{position:fixed;z-index:10100;inset:0;background:#000b;display:flex;justify-content:center;align-items:center;padding:16px}
.lumen-panopto-panel{position:relative;box-sizing:border-box;background:var(--panel,#1d202a);color:var(--ink,#e7e8ed);border:1px solid var(--line-2,#485164);border-radius:18px;padding:22px;width:min(780px,100%);max-height:95vh;overflow:auto;font:14px/1.55 system-ui}
.lumen-panopto-panel h2{font-size:21px;margin:0 0 9px}.lumen-panopto-panel p{color:var(--muted,#bdc3d0)}
.lumen-panopto-panel label{display:block;margin:12px 0 3px}
.lumen-panopto-panel input,.lumen-panopto-panel textarea{box-sizing:border-box;width:100%;display:block;color:var(--ink,#fafafa);background:var(--bg,#121721);border:1px solid var(--line-2,#5a6275);border-radius:8px;padding:10px;font:inherit}
.lumen-panopto-panel textarea{min-height:95px}.lumen-panopto-panel input[type=checkbox]{display:inline-block;width:auto;vertical-align:middle;margin-right:7px}
.lumen-panopto-panel button:not(.lumen-panopto-close){background:#c4d7ff;color:#151923;border-radius:8px;padding:9px 14px;cursor:pointer;margin:10px 7px 0 0;font:inherit}
.lumen-panopto-panel a{color:#a8cbff}.lumen-panopto-close{position:absolute;right:14px;top:12px;background:none;color:inherit;border:none;font-size:26px;cursor:pointer}
.lumen-panopto-rows{max-height:45vh;overflow:auto}.lumen-panopto-rows label{padding:9px;border-bottom:1px solid #3a4050}
.lumen-panopto-rows textarea{min-height:58px}
.lumen-panopto-message{font-size:13px;color:#ffc38c!important}
`;document.head.append(style);
function open(parent){
const d=modalShell("Add a lecture from a transcript",`<p>Upload captions or paste a transcript, optionally add PDF slides, and Lumen will organize the source into a draft outline and review questions. No recording transcription or AI generation runs in this browser edition.</p>
<form id="panopto-import">
<label>Lecture title<input required name="title" placeholder="e.g. Week 6 — Prospective memory"></label>
<label>Caption or transcript file (.vtt, .srt or .txt)<input type="file" name="captions" accept=".txt,.vtt,.srt,text/plain,text/vtt"></label>
<label>Or paste transcript text<textarea name="transcript" placeholder="Paste lecture captions or transcript text here"></textarea></label>
<label>Lecture slides (PDF, optional)<input type="file" name="slides" accept="application/pdf,.pdf"></label>
<label>Panopto recording link (optional)<input type="url" name="url" placeholder="https://…panopto…/Panopto/Pages/Viewer.aspx?id=…"></label>
<p>Already have Panopto captions? Use Captions → Download transcript. Original recordings and PDF files are not stored by this import. Text and study records sync with your account.</p>
<button type="submit">Import and prepare study outline</button>
<p id="panopto-import-status" class="lumen-panopto-message" role="status"></p></form>`);
d.querySelector("form").onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget,submit=form.querySelector("button"),status=d.querySelector("#panopto-import-status");submit.disabled=true;
 try{
  const f=new FormData(form),url=validateUrl(String(f.get("url")||"").trim()),captions=f.get("captions"),pdf=f.get("slides"),pasted=String(f.get("transcript")||"").trim();
  if(captions?.size&&pasted)throw Error("Choose either a caption file or pasted text, so the source is unambiguous.");
  if(!captions?.size&&!pasted)throw Error("Choose a caption file or paste transcript text.");
  if((captions?.size||0)>5*1024*1024)throw Error("This transcript is too large for browser import (5 MiB limit).");
  if((pdf?.size||0)>25*1024*1024)throw Error("Choose a slides PDF smaller than 25 MiB.");
  status.textContent="Reading transcript…";const parsed=parseCaptions(pasted||await captions.text(),pasted?"Pasted transcript":captions.name);
  status.textContent="Reading slide text…";const pages=pdf?.size?await pdfPages(pdf):[];
  status.textContent="Preparing draft outline and review questions…";const chunks=align(pages,parsed.segments,parsed.timed),title=String(f.get("title")||"Lecture").trim();
  const generated=makePack(title,parsed.segments,pages,chunks,parsed.timed);
  const data={parent_id:parent.id,title,panopto_url:url,segments:parsed.segments,chunks,generated,generated_source:"extractive",slide_count:pages.length,duration:Math.ceil(parsed.segments.reduce((end,x)=>Math.max(end,x.end),0)),caption_source:parsed.source,timed_captions:parsed.timed,alignment_estimated:!!pages.length,caption_reviewed:false};
  const r=await fetch("/api/lectures/from-panopto",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  const result=await r.json();if(!r.ok)throw Error(result.detail||"Import failed");
  d.remove();location.hash="#/lecture/"+result.id;window.dispatchEvent(new Event("lumen-remote-updated"));
 }catch(err){status.textContent=err.message||String(err)}finally{submit.disabled=false}
};
}
async function edit(id){
let response=await fetch("/api/lectures/"+encodeURIComponent(id));const bundle=await response.json();if(!response.ok)throw Error(bundle.detail||"Lecture unavailable");
const old=bundle.meta,segments=(old.segments||[]).map(s=>({...s}));if(!segments.length){alert("No captions available for this lecture.");return}
const extractive=old.generated_source==="extractive"||(!old.generated_source&&String(old.generated?.["study-pack.md"]||"").includes("extractive study outline"));
const d=modalShell("Review lecture captions",`<p>Correct technical terms against the recording or slides. Source edits sync with your account. Slide alignment is estimated; untimed text does not provide exact playback links.</p>
<label>Find a term in captions<input type="search" id="caption-filter" placeholder="e.g. hippocampus"></label><div class="lumen-panopto-rows" id="caption-page"></div><div><button id="caption-prev" type="button">Previous</button><button id="caption-next" type="button">Next</button><span id="caption-page-info" role="status"></span></div>
<label><input type="checkbox" id="panopto-rebuild" ${extractive?"checked":""}> Rebuild the draft outline and flashcards from these captions</label><p>This replaces the outline and cards when selected. Your notes, resources, and explanations are kept.</p><button id="panopto-save-corrections">Save reviewed captions</button><p class="lumen-panopto-message" id="panopto-edit-status" role="status"></p>`);
let page=0,query="";const pageSize=60;
const collect=()=>d.querySelectorAll("textarea[data-i]").forEach(el=>{segments[+el.dataset.i].text=el.value.trim()});
function renderPage(){
 const rows=segments.map((segment,index)=>({segment,index})).filter(row=>row.segment.text.toLowerCase().includes(query));
 const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.max(0,Math.min(page,pages-1));
 d.querySelector("#caption-page").innerHTML=rows.slice(page*pageSize,(page+1)*pageSize).map(({segment:s,index:i})=>`<label><strong>${s.untimed?"Segment "+(i+1):fmt(s.start)+" – "+fmt(s.end)}</strong><textarea data-i="${i}">${escape(s.text)}</textarea></label>`).join("")||"<p>No matching captions.</p>";
 d.querySelector("#caption-prev").disabled=page===0;d.querySelector("#caption-next").disabled=page>=pages-1;
 d.querySelector("#caption-page-info").textContent=`${rows.length} segments · page ${page+1} of ${pages}`;
}
d.querySelector("#caption-filter").oninput=e=>{collect();query=e.target.value.toLowerCase().trim();page=0;renderPage()};
d.querySelector("#caption-prev").onclick=()=>{collect();page--;renderPage()};d.querySelector("#caption-next").onclick=()=>{collect();page++;renderPage()};renderPage();
d.querySelector("#panopto-save-corrections").onclick=async e=>{const btn=e.currentTarget,msg=d.querySelector("#panopto-edit-status");btn.disabled=true;try{
 collect();
 if(segments.some(s=>!s.text))throw Error("Caption segments cannot be blank");
 const chunks=old.chunks||[];
 const pages=chunks.filter(c=>c.page).map(c=>({page:c.page,title:c.title,text:c.slide_text||""}));
 const rebuild=d.querySelector("#panopto-rebuild").checked;
 const generated=rebuild?makePack(old.title,segments,pages,chunks,old.timed_captions||false,true):null;
 const r=await fetch("/api/lectures/"+encodeURIComponent(id)+"/transcript",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({segments,chunks,...(generated?{generated,generated_source:"extractive"}:{})})});const x=await r.json();if(!r.ok)throw Error(x.detail||"Could not save");
 d.remove();window.dispatchEvent(new Event("lumen-remote-updated"));
 }catch(err){msg.textContent=err.message||String(err)}finally{btn.disabled=false}};
}
window.LumenPanopto={open,edit,parseCaptions,align,makePack};
})();