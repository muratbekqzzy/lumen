// Procedural detail stays local. Large textures are refined between interactions.
import { textureResolution, seededRandom } from './universe.js';

const atlasRgba=(hex,alpha)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${alpha})`;};
function paintGalaxy(sky,variant,resolution){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=resolution;
  const g=canvas.getContext('2d'),random=seededRandom('galaxy-'+variant);
  g.setTransform(resolution/512,0,0,resolution/512,0,0);
  const colors=sky?(variant?['#8397c4','#cf90c1','#8d80b0']:['#cf90c1','#8d80b0','#8397c4']):variant?['#aacbe0','#cf90c1','#8d80b0']:['#fbd8e0','#8397c4','#cf90c1'];
  // Soft filaments, rather than a luminous disc with a visible outer edge.
  for(let i=0;i<9;i++){
    g.save();g.translate(256+(random()-.5)*115,256+(random()-.5)*65);g.rotate((random()-.5)*1.3);g.scale(1,.28+random()*.35);
    const r=105+random()*105,gradient=g.createRadialGradient(0,0,0,0,0,r),color=colors[i%3];
    gradient.addColorStop(0,atlasRgba(color,i<3?.055:.024));gradient.addColorStop(.42,atlasRgba(color,.012));gradient.addColorStop(1,atlasRgba(color,0));
    g.fillStyle=gradient;g.fillRect(-r,-r,r*2,r*2);g.restore();
  }
  // Each level has identical geometry; higher resolution only adds precision.
  for(let i=0;i<2400;i++){
    const r=Math.min(236,Math.sqrt(-Math.log(Math.max(.0001,1-random())))*105),arm=i%3*Math.PI*2/3,a=r*.025+arm+(random()-.5)*.48;
    const x=256+Math.cos(a)*r+(random()-.5)*15,y=256+Math.sin(a)*r*.6+(random()-.5)*10,size=random()>.996?1.05:.20+random()*.42;
    g.globalAlpha=Math.pow(Math.max(0,1-r/236),1.7)*(.06+random()*.22);g.fillStyle=colors[i%3];g.beginPath();g.arc(x,y,size,0,Math.PI*2);g.fill();
  }
  g.globalAlpha=1;const core=g.createRadialGradient(256,256,0,256,256,27);
  core.addColorStop(0,atlasRgba(sky?'#c5b2d3':'#eee7ec',.14));core.addColorStop(.22,atlasRgba(colors[0],.08));core.addColorStop(.65,atlasRgba(colors[1],.025));core.addColorStop(1,atlasRgba(colors[1],0));
  g.fillStyle=core;g.fillRect(228,228,56,56);return canvas;
}

export function createGalaxyAtlas({onReady=()=>{},generate=paintGalaxy,maxBytes=42*1024*1024,
  schedule=fn=>globalThis.requestIdleCallback?requestIdleCallback(fn,{timeout:400}):setTimeout(fn,32),
  cancel=id=>globalThis.cancelIdleCallback?cancelIdleCallback(id):clearTimeout(id)}={}){
  const cache=new Map(),pending=new Map(),failed=new Set();let bytes=0,task=null,paused=false,destroyed=false,theme=null;
  const keyOf=(sky,variant,resolution)=>`${sky?'sky':'space'}-${variant}-${resolution}`;
  const touch=key=>{const item=cache.get(key);cache.delete(key);cache.set(key,item);return item;};
  function add(key,canvas){
    const size=canvas.width*canvas.height*4;
    while(cache.size&&bytes+size>maxBytes){const oldest=cache.keys().next().value,item=cache.get(oldest);bytes-=item.width*item.height*4;cache.delete(oldest);}
    cache.set(key,canvas);bytes+=size;return canvas;
  }
  function queueWork(){
    if(task!==null||paused||destroyed||!pending.size)return;
    task=schedule(()=>{
      task=null;if(paused||destroyed)return;
      const [key,job]=pending.entries().next().value;pending.delete(key);
      try{if(!cache.has(key))add(key,generate(job.sky,job.variant,job.resolution));onReady();}
      catch(error){failed.add(key);console.warn('Galaxy detail kept at its current resolution',error);}
      queueWork();
    });
  }
  return {
    get(sky,index,demand=512){
      if(destroyed)return null;
      if(theme!==sky){theme=sky;pending.clear();if(task!==null){cancel(task);task=null;}}
      const variant=index%2,resolution=textureResolution(demand),key=keyOf(sky,variant,resolution);
      // Reuse larger detail when zooming out; never repeatedly regenerate levels.
      for(const size of [resolution,...[1024,2048].filter(size=>size>resolution)]){const cached=keyOf(sky,variant,size);if(cache.has(cached))return touch(cached);}
      let fallback;
      for(const size of [1024,512])if(size<resolution&&cache.has(keyOf(sky,variant,size))){fallback=touch(keyOf(sky,variant,size));break;}
      if(!fallback)fallback=add(keyOf(sky,variant,512),generate(sky,variant,512));
      if(resolution>512&&!failed.has(key)){
        for(const [other,job] of pending)if(job.sky===sky&&job.variant===variant&&job.resolution<resolution)pending.delete(other);
        const larger=[...pending.values()].some(job=>job.sky===sky&&job.variant===variant&&job.resolution>=resolution);
        if(!larger)pending.set(key,{sky,variant,resolution});queueWork();
      }
      return fallback;
    },
    pause(){paused=true;if(task!==null){cancel(task);task=null;}},
    resume(){paused=false;queueWork();},
    destroy(){destroyed=true;this.pause();pending.clear();cache.clear();failed.clear();bytes=0;}
  };
}
