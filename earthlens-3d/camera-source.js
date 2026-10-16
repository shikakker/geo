// Normalise Fintraffic's supported Finnish weather-camera station metadata.
// Only provider-approved snapshots; never claim a camera is a live video.
const ENDPOINT='https://tie.digitraffic.fi/api/weathercam/v1/stations';
const URL='https://weathercam.digitraffic.fi/';
const rejectStatus=new Set(['REMOVED','DELETED','INACTIVE','DISABLED','CLOSED','OUT_OF_COLLECTION']);
const isActive=value=>!rejectStatus.has(String(value??'').toUpperCase());
export function normalizeCameras(data,{limit=1200}={}){
 const features=Array.isArray(data?.features)?data.features:[];
 const output=[],seen=new Set();
 for(const feature of features){
  const coordinates=feature?.geometry?.coordinates;
  const lon=Number(coordinates?.[0]),lat=Number(coordinates?.[1]);
  const p=feature?.properties||{};
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<58||lat>72||lon<18||lon>33)continue;
  if(!isActive(p.state)||!isActive(p.collectionStatus))continue;
  const presets=Array.isArray(p.presets)?p.presets:[];
  const preset=presets.find(item=>item?.inCollection===true&&/^[A-Z0-9_-]{4,32}$/i.test(String(item?.id||'')));
  if(!preset||seen.has(preset.id))continue;
  seen.add(preset.id);
  output.push({
   type:'Feature',id:'camera:'+preset.id,
   geometry:{type:'Point',coordinates:[lon,lat]},
   properties:{
    _kind:'cameras',
    name:String(p.name||'Дорожная камера '+String(p.id||'')).slice(0,110),
    _image:URL+encodeURIComponent(preset.id)+'.jpg',
    imageThumbnail:URL+encodeURIComponent(preset.id)+'.jpg?thumbnail=true',
    provider:'Fintraffic Digitraffic',country:'Finland',
    sourceUrl:'https://www.digitraffic.fi/en/road-traffic/',
    imageUpdated:'approximately every 10 minutes'
   }
  });
  if(output.length>=limit)break;
 }
 return output;
}
export async function fetchCameras(fetcher=fetch){
 const response=await fetcher(ENDPOINT,{
  method:'GET',
  headers:{
   Accept:'application/json',
   'Digitraffic-User':'EarthLens3D/1.0 https://earthlens-3d.vercel.app'
  },
  signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw Error('Digitraffic HTTP '+response.status);
 return normalizeCameras(await response.json());
}
