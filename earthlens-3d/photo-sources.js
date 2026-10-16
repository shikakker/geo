// EarthLens photo adapters. Requests run ONLY after a user selects a place.
// "nearby" means geotagged vicinity, not verified photos of the selected building.
// Commercial providers are disabled until an authorized, origin-restricted public key is configured.
export const PHOTO_SOURCES = Object.freeze([
  {id:'commons',name:'Wikimedia Commons',mode:'geotagged',keyless:true,url:'https://commons.wikimedia.org'},
  {id:'wikipedia',name:'Wikipedia',mode:'nearby-pages',keyless:true,url:'https://www.wikipedia.org'},
  {id:'panoramax',name:'Panoramax',mode:'street-imagery',keyless:true,url:'https://panoramax.fr'},
  {id:'inaturalist',name:'iNaturalist',mode:'nature-observations',keyless:true,url:'https://www.inaturalist.org'},
  {id:'kartaview',name:'KartaView',mode:'street-imagery',keyless:true,url:'https://kartaview.org'},
  {id:'osm',name:'OSM-linked image',mode:'feature-image',keyless:true,url:'https://www.openstreetmap.org'},
  {id:'openverse',name:'Openverse',mode:'name-search-not-geotagged',keyless:true,url:'https://openverse.org'},
  {id:'mapillary',name:'Mapillary',mode:'street-imagery',keyless:false,url:'https://www.mapillary.com'},
  {id:'flickr',name:'Flickr',mode:'geotagged',keyless:false,url:'https://www.flickr.com'},
  {id:'unsplash',name:'Unsplash',mode:'name-search-not-geotagged',keyless:false,url:'https://unsplash.com'}
]);
const config = {
  mapillary:String(import.meta.env?.VITE_MAPILLARY_TOKEN||'').trim(),
  flickr:String(import.meta.env?.VITE_FLICKR_API_KEY||'').trim(),
  unsplash:String(import.meta.env?.VITE_UNSPLASH_ACCESS_KEY||'').trim()
};
const nearbyLabel='Фото поблизости, объект на снимке не подтверждён';
function https(value){
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname?u.toString():null}catch{return null}
}
function photo({provider,title,img,url,license='',kind='nearby',author='' }){
  const image=https(img),link=https(url);
  if(!image||!link)return null;
  return {provider,title:String(title||provider).slice(0,150),img:image,url:link,license:String(license||'').slice(0,110),kind,author:String(author||'').slice(0,100)};
}
function params(obj){return new URLSearchParams(Object.entries(obj).filter(([,v])=>v!==undefined&&v!==null))}
async function request(url,signal){
  const timeout=AbortSignal.timeout(8000);
  const combined=signal&&AbortSignal.any?AbortSignal.any([signal,timeout]):signal||timeout;
  const response=await fetch(url,{signal:combined,headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Photo source HTTP '+response.status);
  return response.json();
}
async function commons({lat,lon,signal}){
  const q=params({action:'query',generator:'geosearch',ggscoord:lat+'|'+lon,ggsradius:500,ggslimit:12,ggsnamespace:6,ggsprimary:'all',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:380,format:'json',origin:'*'});
  const result=await request('https://commons.wikimedia.org/w/api.php?'+q,signal);
  return Object.values(result.query?.pages||{}).map(item=>{
    const im=item.imageinfo?.[0];return photo({provider:'Wikimedia Commons',title:item.title?.replace(/^File:/,''),img:im?.thumburl,url:im?.descriptionurl,license:im?.extmetadata?.LicenseShortName?.value||'',kind:'geotagged'});
  }).filter(Boolean);
}
async function wikipedia({lat,lon,signal}){
  const q=params({action:'query',generator:'geosearch',ggscoord:lat+'|'+lon,ggsradius:550,ggslimit:10,ggsnamespace:0,prop:'pageimages|info',piprop:'thumbnail',pithumbsize:380,inprop:'url',format:'json',formatversion:2,origin:'*'});
  const result=await request('https://en.wikipedia.org/w/api.php?'+q,signal);
  const pages=result.query?.pages||[];
  return (Array.isArray(pages)?pages:Object.values(pages)).map(p=>photo({provider:'Wikipedia',title:p.title,img:p.thumbnail?.source,url:p.fullurl,kind:'nearby-article'})).filter(Boolean);
}
function bounds(lat,lon,radiusKm=.5){
  const y=radiusKm/111.2,x=radiusKm/(111.2*Math.max(.15,Math.cos(lat*Math.PI/180)));
  return [Math.max(-179.999,lon-x),Math.max(-85,lat-y),Math.min(179.999,lon+x),Math.min(85,lat+y)];
}
async function panoramax({lat,lon,signal}){
  const data=await request('https://api.panoramax.xyz/api/search?'+params({bbox:bounds(lat,lon).join(','),limit:12}),signal);
  return (data.features||[]).map(f=>{
    const assets=f.assets||{},im=assets.thumb?.href||assets.thumbnail?.href||assets.preview?.href||assets.hd?.href;
    const link=f.links?.find(l=>l.rel==='self')?.href||'https://explore.panoramax.fr/';
    return photo({provider:'Panoramax',title:'Уличная панорама',img:im,url:link,kind:'street-imagery'});
  }).filter(Boolean);
}
async function inaturalist({lat,lon,signal}){
  const data=await request('https://api.inaturalist.org/v1/observations?'+params({lat,lng:lon,radius:.5,photos:true,per_page:10,order:'desc',order_by:'observed_on'}),signal);
  return (data.results||[]).map(o=>{
    const im=o.photos?.[0];return photo({provider:'iNaturalist',title:o.taxon?.preferred_common_name||o.species_guess||'Природа',img:im?.url?.replace('/square.','/medium.'),url:o.id?'https://www.inaturalist.org/observations/'+o.id:null,license:im?.license_code||o.license_code||'',kind:'nature-observation',author:im?.attribution||''});
  }).filter(Boolean);
}
async function kartaview({lat,lon,signal}){
  const data=await request('https://api.openstreetcam.org/2.0/photo/?'+params({lat,lng:lon,radius:400,itemsPerPage:12}),signal);
  const rows=Array.isArray(data)?data:data.result?.data||data.result?.photos||data.data?.photos||data.data||[];
  return (Array.isArray(rows)?rows:[]).map(p=>photo({provider:'KartaView',title:'Фото улицы',img:p.thumbUrl||p.thumbnailUrl||p.thumb_path||p.fileurlProc||p.fileurl,url:p.id?'https://kartaview.org/details/'+encodeURIComponent(p.id):'https://kartaview.org',kind:'street-imagery'})).filter(Boolean);
}
async function osm({tags}){
  const img=tags?.image||tags?.['image:0'];
  const direct=https(img);
  const raw=tags?.wikimedia_commons?.replace(/^File:/i,'');
  const wiki=raw&&/^.{3,160}\.(jpe?g|png|webp)$/i.test(raw)
    ?'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(raw):null;
  const result=[];
  if(direct)result.push(photo({provider:'OpenStreetMap',title:tags.name||'Фото объекта OSM',img:direct,url:direct,kind:'feature-image'}));
  if(wiki)result.push(photo({provider:'OSM × Commons',title:tags.name||'Фото объекта OSM',img:wiki+'?width=380',url:wiki,kind:'feature-image'}));
  return result.filter(Boolean);
}
async function openverse({label,signal}){
  if(!label||label.length<3||/^-?\d+(\.\d+)?[, ]/.test(label))return [];
  const data=await request('https://api.openverse.org/v1/images/?'+params({q:label,page_size:8}),signal);
  return (data.results||[]).map(p=>photo({provider:'Openverse · поиск по названию',title:p.title,img:p.thumbnail,url:p.foreign_landing_url||p.url,license:[p.license,p.license_version].filter(Boolean).join(' '),kind:'text-match',author:p.creator})).filter(Boolean);
}
async function mapillary({lat,lon,signal}){
  if(!config.mapillary)return [];
  const data=await request('https://graph.mapillary.com/images?'+params({access_token:config.mapillary,bbox:bounds(lat,lon).join(','),fields:'id,thumb_256_url',limit:10}),signal);
  return (data.data||[]).map(p=>photo({provider:'Mapillary',title:'Уличное фото',img:p.thumb_256_url,url:p.id?'https://www.mapillary.com/app/?pKey='+encodeURIComponent(p.id):null,kind:'street-imagery'})).filter(Boolean);
}
async function flickr({lat,lon,signal}){
  if(!config.flickr)return [];
  const data=await request('https://www.flickr.com/services/rest/?'+params({method:'flickr.photos.search',api_key:config.flickr,lat,lon,radius:.4,radius_units:'km',extras:'url_m,url_s,geo,license',has_geo:1,per_page:10,format:'json',nojsoncallback:1}),signal);
  return (data.photos?.photo||[]).map(p=>photo({provider:'Flickr',title:p.title,img:p.url_m||p.url_s,url:p.owner&&p.id?'https://www.flickr.com/photos/'+p.owner+'/'+p.id:null,license:p.license,kind:'geotagged'})).filter(Boolean);
}
async function unsplash({label,signal}){
  if(!config.unsplash||!label||label.length<3)return [];
  const data=await request('https://api.unsplash.com/search/photos?'+params({query:label,per_page:8,client_id:config.unsplash}),signal);
  return (data.results||[]).map(p=>photo({provider:'Unsplash · поиск по названию',title:p.description||p.alt_description||label,img:p.urls?.small,url:p.links?.html,kind:'text-match',author:p.user?.name})).filter(Boolean);
}
const ADAPTERS={commons,wikipedia,panoramax,inaturalist,kartaview,osm,openverse,mapillary,flickr,unsplash};
export function photoProviders(){
  return PHOTO_SOURCES.map(item=>({...item,enabled:item.keyless||!!config[item.id]}));
}
export async function loadGeoPhotos({lat,lon,label='',tags={},signal,onBatch=()=>{}}){
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)return [];
  const context={lat,lon,label:String(label).slice(0,100),tags,signal};
  const results=[],seen=new Set();
  await Promise.all(PHOTO_SOURCES.filter(p=>p.keyless||config[p.id]).map(async s=>{
    try{
      const photos=await ADAPTERS[s.id](context);
      if(signal?.aborted)return;
      const batch=[];
      for(const item of photos){
        if(seen.has(item.url)||results.length>=40)continue;
        seen.add(item.url);results.push(item);batch.push(item);
      }
      if(batch.length)onBatch(batch,results.slice());
    }catch(error){if(!signal?.aborted)console.debug('Photo provider unavailable:',s.id,error.message)}
  }));
  return results;
}
export const PHOTO_PROXIMITY_NOTICE=nearbyLabel;
