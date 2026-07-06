import { routeData } from '../src/data/index.ts';
import { cities } from '../src/data/cities.ts';
import { segmentClassifications as segs } from '../src/data/segmentMeta.ts';
const R=6371,toR=(d:number)=>d*Math.PI/180;
const hav=(a:any,b:any)=>{const dLa=toR(b.lat-a.lat),dLo=toR(b.lng-a.lng);const x=Math.sin(dLa/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
const cityById=new Map(cities.map((c:any)=>[c.id,c]));
const capById=new Map(routeData.capitals.map((c:any)=>[c.id,c]));
const seg:any = (segs as any[]).find(s=>s.fromCapitalId==='MN'&&s.toCapitalId==='PH');
const ids=['MN', ...seg.waypointCityIds, 'PH'];
const pos=(id:string)=>{const c=cityById.get(id)||capById.get(id);return c?{lat:c.lat,lng:c.lng,name:(c as any).nameJa||id}:null;};
// only show the 運城→武漢 stretch
let started=false;
for(let i=0;i<ids.length-1;i++){
  const a=pos(ids[i]),b=pos(ids[i+1]);
  if(!a||!b)continue;
  if(ids[i]==='CN-YUNCHENG')started=true;
  if(!started)continue;
  const d=Math.round(hav(a,b));
  console.log(`${d>200?'⚠':' '} ${a.name} → ${b.name}: ${d}km`);
  if(ids[i+1]==='CN-WUHAN')break;
}
