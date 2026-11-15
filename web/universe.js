// Pure scene calculations. Camera and rendering never change library records.
export function canvasPixelRatio(width,height,deviceRatio=1){
  return Math.max(.5,Math.min(Number(deviceRatio)||1,3,Math.sqrt(14000000/Math.max(1,width*height))));
}
export function textureResolution(pixelDemand){
  return pixelDemand<=512?512:pixelDemand<=1024?1024:2048;
}
export function starAppearance(kind,radius,zoom,selected=false){
  const magnification=Math.sqrt(Math.max(.01,zoom)),section=kind==='section';
  return {corePx:Math.max(.8,Math.min(radius*magnification*.42,section?2.2:1.6)),
    haloPx:Math.min(selected?30:section?26:18,6+radius*magnification*3),
    haloOpacity:selected?.85:section?.7:.55};
}
export const rotatePoint = (point, angle = 0) => ({x:point.x*Math.cos(angle)-point.y*Math.sin(angle),y:point.x*Math.sin(angle)+point.y*Math.cos(angle)});
export function screenPoint(point,camera,width,height){const p=rotatePoint(point,camera.angle||0);return {x:width/2+camera.x+p.x*camera.k,y:height/2+camera.y+p.y*camera.k};}
export function worldPoint(point,camera,width,height){return rotatePoint({x:(point.x-width/2-camera.x)/camera.k,y:(point.y-height/2-camera.y)/camera.k},-(camera.angle||0));}
export function galaxyLayout(nodes){
 const ids=[...new Set(nodes.map(node=>node.galaxy))].sort(),counts=new Map(ids.map(id=>[id,0]));
 for(const node of nodes)if(node.kind!=='concept')counts.set(node.galaxy,(counts.get(node.galaxy)||0)+1);
 const sizes=ids.map(id=>28+Math.min(160,Math.sqrt(Math.max(0,counts.get(id)-1))*14));
 const result=new Map();
 const radius=ids.length===2?(sizes[0]+sizes[1]+42)/2:ids.length>2?Math.max(...sizes)+sizes.reduce((sum,size)=>sum+size,0)/Math.PI+20:0;
 ids.forEach((id,i)=>{const angle=ids.length===2?i*Math.PI-.12:i/ids.length*Math.PI*2-Math.PI/2;
  result.set(id,{id,index:i,members:counts.get(id),footprint:sizes[i],ax:Math.cos(angle)*radius,ay:Math.sin(angle)*radius});
 });
 return result;
}
export function overviewCamera(points,width,height,{mini=false,angle=0}={}){
 const padding={x:mini?18:Math.min(54,width*.075),top:mini?18:Math.min(width<=900?120:100,height*.25),bottom:mini?18:Math.min(100,height*.25)};
 let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 for(const point of points){const p=rotatePoint(point,angle),r=point.r||0;x0=Math.min(x0,p.x-r);x1=Math.max(x1,p.x+r);y0=Math.min(y0,p.y-r);y1=Math.max(y1,p.y+r);}
 if(!points.length||width<1||height<1)return {x:0,y:0,k:1,angle};
 const spanX=Math.max(mini?100:220,x1-x0),spanY=Math.max(mini?70:150,y1-y0);
 const k=Math.max(.04,Math.min((width-padding.x*2)*.76/spanX,(height-padding.top-padding.bottom)*.76/spanY,mini?1.5:2.2));
 return {x:-(x0+x1)/2*k,y:-(y0+y1)/2*k+(padding.top-padding.bottom)/2,k,angle};
}
