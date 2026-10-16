// Activated extension: standalone SunCalc MIT astronomy calculations.
// No remote API: load the module only when a user opens the weather details.
export const GEO_ENABLED_LIBRARIES=Object.freeze({
  "suncalc":()=>import('suncalc')
});
export async function loadEnabledGeoLibrary(name){
 const loader=GEO_ENABLED_LIBRARIES[name];
 if(!loader)throw Error('GIS package is not installed: '+String(name));
 return loader();
}
