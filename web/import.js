/* Prepared Markdown -> a lecture. No model, transcript or recording is required. */
(()=>{'use strict';
const LIMIT=1024*1024,CATEGORIES=['academic','professional','creative','language'];
const bytes=text=>new TextEncoder().encode(text).byteLength;
const norm=text=>String(text||'').normalize('NFKC').trim().toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ');
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function headings(lines){
 const out=[];let fence=null;
 for(let i=0;i<lines.length;i++){
  const marker=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
  if(fence){if(marker&&marker[1][0]===fence.char&&marker[1].length>=fence.length&&!marker[2].trim()){
    if(['quiz','plotly','qa'].includes(fence.info)){
     let data;try{data=JSON.parse(lines.slice(fence.line,i).join('\n'))}catch{throw Error('Check the '+fence.info+' JSON near line '+fence.line+'.');}
     if(fence.info==='quiz'&&(!Array.isArray(data?.questions)||!data.questions.length||data.questions.some(q=>!q||typeof q.q!=='string'||!Array.isArray(q.options)||q.options.length<2||q.options.some(o=>typeof o!=='string')||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length)))throw Error('Check the quiz questions and answer indices near line '+fence.line+'.');
     if(fence.info==='plotly'&&!Array.isArray(data?.data))throw Error('The chart near line '+fence.line+' needs a data array.');
     if(fence.info==='qa'&&(typeof data?.q!=='string'||typeof data?.a!=='string'))throw Error('The practice block needs a question and answer.');
    }
    fence=null;
   }continue;}
  if(marker){fence={char:marker[1][0],length:marker[1].length,line:i+1,info:marker[2].trim()};continue;}
  const heading=/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
  if(heading)out.push({line:i,level:heading[1].length,title:heading[2]});
 }
 if(fence)throw Error('A code block is missing its closing fence near line '+fence.line+'.');
 return out;
}
function parse(text,filename='lecture.md'){
 if(typeof text!=='string'||!text.trim())throw Error('Choose a Markdown file with lecture material.');
 if(bytes(text)>LIMIT)throw Error('Choose a Markdown file smaller than 1 MiB.');
 if(text.includes('\0'))throw Error('This file contains binary data. Choose a UTF-8 Markdown file.');
 const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n'),metadata={},aliases={course:'module',title:'lecture',type:'category'};
 const keys=new Set(['lumen','section','module','lecture','category','section_id','module_id','lecture_id']);
 if(lines[0].trim()==='---'){
  const end=lines.findIndex((line,i)=>i>0&&/^(---|\.\.\.)\s*$/.test(line));
  if(end<0)throw Error('The destination header needs a closing --- line.');
  for(const line of lines.slice(1,end)){
   if(!line.trim()||/^\s*#/.test(line))continue;
   const field=/^([a-zA-Z_][\w-]*):\s*(.*?)\s*$/.exec(line);
   if(!field)throw Error('Use one destination field per line in the Markdown header.');
   const key=Object.hasOwn(aliases,field[1])?aliases[field[1]]:field[1];
   if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsupported destination field.');
   if(!keys.has(key))continue;
   if(Object.hasOwn(metadata,key))throw Error('The destination header repeats '+key+'.');
   let value=field[2];
   if(value.startsWith('"')){try{value=JSON.parse(value)}catch{throw Error('Check the quotes around '+key+' in the destination header.')}}
   else if(value.startsWith("'")){if(!value.endsWith("'"))throw Error('Check the quotes around '+key+'.');value=value.slice(1,-1).replace(/''/g,"'");}
   if(typeof value!=='string'||value.length>4096)throw Error('The '+key+' destination must be plain text.');
   metadata[key]=value.trim();
  }
  lines.splice(0,end+1);
 }
 if(metadata.lumen&&metadata.lumen!=='1')throw Error('This Markdown template version is not supported.');
 if(metadata.category&&!CATEGORIES.includes(norm(metadata.category)))throw Error('Choose Academic, Professional, Creative or Language.');
 if(metadata.category)metadata.category=norm(metadata.category);
 const hs=headings(lines),removed=new Set(),practice=[],slides=[];
 for(let i=0;i<hs.length;i++){
  const h=hs[i],name=norm(h.title).replace(/\.md$/,'').replace(/[-_]/g,' ');
  if(h.level>2||!['flashcards','practice questions','slide explanations','slide notes'].includes(name))continue;
  const next=hs.slice(i+1).find(other=>other.level<=h.level),end=next?.line??lines.length;
  const block=lines.slice(h.line+1,end),body=block.join('\n').trim();
  for(let line=h.line;line<end;line++)removed.add(line);
  if(['flashcards','practice questions'].includes(name)){if(body)practice.push(body);}
  else if(body){
   const pages=headings(block).map(p=>({...p,match:/^slide\s+(\d+)\b/i.exec(p.title)})).filter(p=>p.match);
   if(!pages.length)throw Error('Under Slide explanations, use headings such as ## Slide 1.');
   const intro=block.slice(0,pages[0].line).join('\n').trim();if(intro)slides.push({page:0,body:intro});
   for(let j=0;j<pages.length;j++){
    const page=Number(pages[j].match[1]);
    if(page<1||page>300||slides.some(s=>s.page===page))throw Error('Slide explanation numbers must be unique and between 1 and 300.');
    slides.push({page,title:pages[j].title,body:block.slice(pages[j].line+1,pages[j+1]?.line??block.length).join('\n').trim()});
   }
  }
  while(i+1<hs.length&&hs[i+1].line<end)i++;
 }
 let content=lines.filter((_,i)=>!removed.has(i)).join('\n').trim();
 content=content.replace(/^#\s+study[- ]pack(?:\.md)?\s*\n+/i,'').replace(/^#\s+explanation\.md\s*$/gm,'## Explanation');
 if(!content.trim())throw Error('Include a lecture explanation or study material, not only flashcards or slide notes.');
 const title=hs.find(h=>h.level===1&&!removed.has(h.line)&&!/^study[- ]pack(?:\.md)?$/i.test(h.title))?.title;
 return {metadata,content,practice:practice.join('\n\n'),slide_explanations:slides,
  suggested_title:metadata.lecture||title||filename.replace(/\.(md|markdown)$/i,'').replace(/[_-]+/g,' ').trim(),filename,source_bytes:bytes(text)};
}
function plan(state,metadata={},overrides={}){
 const active=node=>node&&!state.deleted[node.id];
 const archived=node=>{const seen=new Set();for(let n=node;n&&!seen.has(n.id);n=state.records[n.parent]){if(n.id==='archive')return true;seen.add(n.id);}return false;};
 const live=Object.values(state.records).filter(node=>active(node)&&!archived(node));
 const single=(list,label)=>{if(list.length>1)throw Object.assign(Error('More than one '+label+' matches. Choose the exact destination.'),{matches:list,kind:label});return list[0]||null;};
 const code=value=>norm(value).replace(/\s/g,'').match(/^[a-z]{2,}\d{3,}[a-z]?$/)?.[0];
 const leadingCode=value=>norm(value).match(/^([a-z]{2,})\s*(\d{3,}[a-z]?)(?=$|[\s:\-])/)?.slice(1).join('');
 const lectureNumber=value=>/^(?:lecture|lec|l)\s*0*(\d+)\b/i.exec(norm(value))?.[1];
 const resolve=(kind,parent,name,explicit)=>{
  if(explicit){const node=state.records[explicit];if(!active(node)||archived(node)||node.kind!==kind||parent&&node.parent!==parent.id)throw Error('The saved '+kind+' destination is no longer available here.');return node;}
  const candidates=live.filter(n=>n.kind===kind&&(!parent||n.parent===parent.id));
  const exact=candidates.filter(n=>norm(n.title)===norm(name));if(exact.length)return single(exact,kind);
  if(kind==='module'&&code(name))return single(candidates.filter(n=>leadingCode(n.title)===code(name)),kind);
  if(kind==='lecture'&&lectureNumber(name))return single(candidates.filter(n=>Number(lectureNumber(n.title))===Number(lectureNumber(name))),kind);
  return null;
 };
 const fields={...metadata,...overrides};
 for(const key of ['section','module','lecture','category','section_id','module_id','lecture_id'])if(fields[key]!==undefined&&(typeof fields[key]!=='string'||fields[key].length>4096))throw Error('Destination fields must be plain text.');
 // Stable IDs supplied without names infer their actual parent path.
 if(fields.lecture_id){const n=state.records[fields.lecture_id];if(!active(n)||n.kind!=='lecture'||archived(n))throw Error('The lecture destination is unavailable.');fields.module_id ||= n.parent;}
 if(fields.module_id){const n=state.records[fields.module_id];if(!active(n)||n.kind!=='module'||archived(n))throw Error('Choose a module inside a section.');fields.section_id ||= n.parent;}
 const category=norm(fields.category||'academic');if(!CATEGORIES.includes(category))throw Error('Choose a supported category.');
 const section=resolve('section',null,fields.section,fields.section_id);
 if(!section&&!String(fields.section||'').trim())throw Error('Choose a section for this lecture.');
 const sectionSpec=section||{title:String(fields.section).trim(),kind:'section',type:category,new:true};
 const module=section?resolve('module',section,fields.module,fields.module_id):null;
 if(!module&&!String(fields.module||'').trim())throw Error('Choose a module for this lecture.');
 const moduleSpec=module||{title:String(fields.module).trim(),kind:'module',type:sectionSpec.type||category,new:true};
 const lecture=module?resolve('lecture',module,fields.lecture,fields.lecture_id):null;
 if(!lecture&&!String(fields.lecture||'').trim())throw Error('Give this lecture a title.');
 const lectureSpec=lecture||{title:String(fields.lecture).trim(),kind:'lecture',new:true};
 for(const spec of [sectionSpec,moduleSpec,lectureSpec])if(spec.title.length>4096)throw Error('A destination name is too long.');
 return {section:sectionSpec,module:moduleSpec,lecture:lectureSpec};
}
function template({section='Your section',module='Your module',lecture='Lecture 01 - Your topic',category='academic',lecture_id,section_id,module_id}={}){
 section ||= 'Your section';module ||= 'Your module';lecture ||= 'Lecture 01 - Your topic';if(!CATEGORIES.includes(category))category='academic';
 const fields={lumen:'1',section,module,lecture,category,...(section_id?{section_id}:{}),...(module_id?{module_id}:{}),...(lecture_id?{lecture_id}:{})};
 return '---\n'+Object.entries(fields).map(([key,value])=>key+': '+JSON.stringify(value)).join('\n')+'\n---\n\n# '+lecture+'\n\n## Overview\nA concise explanation of the main idea.\n\n## Understand it\nExplain the concepts and include worked examples, images and useful diagrams.\n\n## Check your understanding\n```quiz\n{"title":"Quick practice","questions":[{"q":"What is the central idea?","options":["First answer","Second answer"],"answer":0,"why":"Explain the reasoning."}]}\n```\n\n# Slide explanations\n\n## Slide 1\nThe prepared explanation for the first slide. You can attach the PDF later.\n';
}
function download(text,name){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function open(context={}){
 if(!window.LumenCloud)return;
 const account=window.LumenCloud.activeAccountId,initial=window.LumenCloud.exportData(),current=context.lectureId?initial.records[context.lectureId]:null;
 let parent=current?initial.records[current.parent]:initial.records[context.parentId],module=parent?.kind==='module'?parent:null;
 while(parent&&parent.kind!=='section')parent=initial.records[parent.parent];
 const defaults={section:parent?.title||'',module:module?.title||'',lecture:current?.title||'',category:parent?.type||'academic',...(parent?{section_id:parent.id}:{}),...(module?{module_id:module.id}:{}),...(current?{lecture_id:current.id}:{})};
 const overlay=document.createElement('div');overlay.className='scrim markdown-import';
 overlay.innerHTML=`<form class="dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><button class="import-close icon-btn" type="button" aria-label="Close import">×</button><span class="welcome-kicker">A place for your ideas</span><h2 id="import-title">Import a lecture</h2><p>One Markdown file becomes your complete lecture. Slides are optional.</p><label class="import-drop"><span>Choose a Markdown file</span><small>or drop it here · .md or .markdown · up to 1 MiB</small><input type="file" accept=".md,.markdown,text/markdown,text/plain"></label><div class="import-destination" hidden><label>Section<input type="text" name="section" list="import-sections" required></label><datalist id="import-sections"></datalist><label>Module<input type="text" name="module" list="import-modules" required></label><datalist id="import-modules"></datalist><label>Lecture<input type="text" name="lecture" list="import-lectures" required></label><datalist id="import-lectures"></datalist><label class="import-category">Category<select name="category">${CATEGORIES.map(c=>`<option value="${c}">${c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select></label><div class="import-summary" role="status"></div></div><p class="import-error" role="alert"></p><div class="actions"><button type="button" class="btn ghost import-template">Get a template</button><button type="submit" class="btn primary" disabled>Import lecture</button></div><small class="import-help">A destination header fills these fields automatically. Existing slides and your notes stay in place.</small></form>`;
 document.body.append(overlay);const form=overlay.querySelector('form'),input=form.querySelector('input[type=file]'),destination=form.querySelector('.import-destination'),message=form.querySelector('.import-error'),summary=form.querySelector('.import-summary'),submit=form.querySelector('[type=submit]');
 const field=name=>form.elements.namedItem(name);let parsed=null,ids={},filename='',rawText='',loading=0,saving=false;
 function close(){if(saving)return;document.removeEventListener('keydown',onKey);overlay.remove();context.onClose?.();}
 const previousFocus=document.activeElement;
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();previousFocus?.focus?.();}else if(e.key==='Tab'){const items=[...form.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node=>!node.closest('[hidden]'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',onKey);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});form.querySelector('.import-close').onclick=close;
 function selected(){return {section:field('section').value.trim(),module:field('module').value.trim(),lecture:field('lecture').value.trim(),category:field('category').value,...ids};}
 function update(){
  if(!parsed||saving)return;message.textContent='';submit.disabled=true;
  if(account!==window.LumenCloud.activeAccountId){message.textContent='Your account changed. Reopen import in the correct account.';return;}
  const state=window.LumenCloud.exportData();
  try{const target=plan(state,{},selected());summary.textContent=[target.section.title,target.module.title,target.lecture.title].join(' › ')+(target.lecture.new?' · New lecture':' · Update lecture');form.querySelector('.import-category').hidden=!target.section.new;submit.textContent=target.lecture.new?'Import lecture':'Update lecture';submit.disabled=false;}catch(error){summary.textContent='';message.textContent=error.message;
   if(error.matches){for(const match of error.matches){const button=document.createElement('button');button.type='button';button.className='btn ghost import-match';const parent=state.records[match.parent];button.textContent=[parent?.title,match.title].filter(Boolean).join(' › ')+' · '+new Date(match.updated).toLocaleDateString();button.onclick=()=>{ids[error.kind+'_id']=match.id;field(error.kind).value=match.title;if(error.kind==='module'){ids.section_id=match.parent;field('section').value=parent.title;}if(error.kind==='lecture'){ids.module_id=match.parent;field('module').value=parent.title;const section=state.records[parent.parent];ids.section_id=section.id;field('section').value=section.title;}update();};summary.append(button);}}
  }
  const list=(kind,parentTitle)=>Object.values(state.records).filter(n=>!state.deleted[n.id]&&n.kind===kind&&(!parentTitle||norm(state.records[n.parent]?.title)===norm(parentTitle)));
  for(const [kind,plural,parentTitle] of [['section','sections',null],['module','modules',field('section').value],['lecture','lectures',field('module').value]])form.querySelector('#import-'+plural).innerHTML=list(kind,parentTitle).map(n=>`<option value="${escape(n.title)}"></option>`).join('');
 }
 for(const name of ['section','module','lecture','category'])field(name).addEventListener('input',()=>{if(name==='section')ids={};if(name==='module'){delete ids.module_id;delete ids.lecture_id;}if(name==='lecture')delete ids.lecture_id;update();});
 async function load(file){
  if(saving)return;
  const version=++loading;message.textContent='';submit.disabled=true;parsed=null;
  try{if(!/\.(md|markdown)$/i.test(file.name))throw Error('Choose a .md or .markdown file.');if(file.size>LIMIT)throw Error('Choose a Markdown file smaller than 1 MiB.');const original=await file.text(),document=parse(original,file.name);if(version!==loading||!overlay.isConnected)return;
   parsed=document;rawText=original;filename=file.name;const m=document.metadata,explicit=!!(m.section||m.module||m.section_id||m.module_id||m.lecture_id);
   const values=explicit?m:{...defaults,...m};ids=Object.fromEntries(['section_id','module_id','lecture_id'].filter(key=>values[key]).map(key=>[key,values[key]]));
   try{const p=plan(window.LumenCloud.exportData(),values);for(const name of ['section','module','lecture'])field(name).value=p[name].title;}catch{for(const name of ['section','module','lecture'])field(name).value=values[name]||(name==='lecture'?document.suggested_title:'');}
   field('category').value=CATEGORIES.includes(values.category)?values.category:'academic';destination.hidden=false;form.querySelector('.import-drop span').textContent=filename;update();
  }catch(error){if(version===loading){destination.hidden=true;message.textContent=error.message;}}
 }
 input.onchange=()=>{if(input.files?.[0])load(input.files[0]);};
 const drop=form.querySelector('.import-drop');drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};drop.ondragleave=()=>drop.classList.remove('over');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');if(e.dataTransfer?.files?.length===1)load(e.dataTransfer.files[0]);else message.textContent='Import one Markdown file at a time.';};
 form.querySelector('.import-template').onclick=()=>download(template({...defaults,...(parsed?selected():{})}),'lumen-lecture-template.md');
 form.onsubmit=async e=>{e.preventDefault();if(!parsed||saving||submit.disabled)return;update();if(submit.disabled)return;saving=true;submit.disabled=true;input.disabled=true;submit.textContent='Importing…';
  try{const response=await fetch('/api/lectures/import-markdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:rawText,filename,destination:selected(),accountId:account})});const data=await response.json();if(!response.ok)throw Error(data.detail||'Could not import the lecture.');saving=false;close();window.dispatchEvent(new Event('lumen-remote-updated'));location.hash='#/lecture/'+data.id+'/pack';}
  catch(error){saving=false;input.disabled=false;update();message.textContent=error.message;}
 };
 input.focus();return overlay;
}
window.LumenImport={parse,plan,template,open,limit:LIMIT,categories:CATEGORIES};
})();
