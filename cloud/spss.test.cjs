const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('web/spss.html','utf8'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function studio({search='?lesson=invalid',saved='null',blocked=false}={}){
 const elements=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{style:{},innerHTML:'',textContent:'',value:key==='#p'?'.025':'10',setAttribute(){}});return elements.get(key)};
 const context={document:{querySelector:element,querySelectorAll:()=>[]},location:{search},history:{replaceState(){}},window:{scrollTo(){}},URLSearchParams,localStorage:{getItem:()=>saved,setItem(){if(blocked)throw Error('Storage unavailable')}}};
 vm.createContext(context);vm.runInContext(source,context);return {context,elements,element};
}
test('every SPSS lesson renders; invalid URLs and corrupt progress do not break navigation',()=>{
 const s=studio();assert.equal(vm.runInContext('current',s.context),0);
 for(let i=0;i<10;i++){vm.runInContext('go('+i+')',s.context);assert(s.element('#lesson').innerHTML.length>500)}
 assert.equal(vm.runInContext('lessons.length === chapters.length',s.context),true);
});
test('SPSS makes local-only progress clear and handles blocked storage without crashing',()=>{
 const s=studio({blocked:true,saved:'{"0":true,"50":true}'});assert.equal(s.element('#progresslabel').textContent,'1 / 10 lessons marked learned');
 s.element('#complete').onclick();assert.match(s.element('#progress-storage').textContent,/unavailable/);assert(html.includes('Progress is saved on this browser only.'));
});
test('SPSS worked example means, sums of squares and F match its actual displayed observations',()=>{
 const table=html.slice(html.indexOf('<th>No mobile</th>')).split('</table>')[0];
 const rows=[...table.matchAll(/<tr><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)].map(x=>x.slice(1).map(Number));assert.equal(rows.length,5);
 const groups=[0,1,2].map(i=>rows.map(r=>r[i])),mean=x=>x.reduce((a,b)=>a+b,0)/x.length,means=groups.map(mean),grand=mean(groups.flat());
 assert.deepEqual(means,[11,9,7]);const between=groups.reduce((sum,g,i)=>sum+g.length*(means[i]-grand)**2,0),within=groups.reduce((sum,g,i)=>sum+g.reduce((s,v)=>s+(v-means[i])**2,0),0);
 assert.equal(between,40);assert.equal(within,36);assert.equal(((between/2)/(within/12)).toFixed(2),'6.67');
 const p=(12/(12+2*((between/2)/(within/12))))**6;assert.equal(p.toFixed(3),'0.011');
});
