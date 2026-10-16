// Sun altitude and azimuth from a self-hosted, no-key SunCalc library.
// Astronomy values are computed locally, not sourced from a weather API.
import {loadEnabledGeoLibrary} from './geo-addon-enabled.js';
export async function solarPosition({lat,lon,at=new Date(),loader=loadEnabledGeoLibrary}){
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)return null;
 const module=await loader('suncalc');
 const calc=module.default||module;
 if(typeof calc.getPosition!=='function')return null;
 const value=calc.getPosition(at,lat,lon);
 if(!Number.isFinite(value?.altitude)||!Number.isFinite(value?.azimuth))return null;
 const altitude=Math.round(value.altitude*180/Math.PI*10)/10;
 const azimuth=(value.azimuth*180/Math.PI+180+360)%360;
 return {altitude,azimuth:Math.round(azimuth*10)/10,daylight:altitude>0,computedAt:at.toISOString(),provider:'SunCalc — local astronomical calculation'};
}
