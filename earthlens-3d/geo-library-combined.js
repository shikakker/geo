// Two separately audited, opt-in catalogs. Never import package code here.
import {GEO_LIBRARY_CATALOG as FIRST,GEO_LIBRARY_GROUPS as FIRST_GROUPS} from './geo-library-catalog.js';
import {GEO_LIBRARY_CATALOG_EXTRA as SECOND,GEO_LIBRARY_GROUPS_EXTRA as SECOND_GROUPS} from './geo-library-catalog-extra.js';
export const GEO_LIBRARY_GROUPS=Object.freeze([...FIRST_GROUPS,...SECOND_GROUPS]);
export const GEO_LIBRARY_CATALOG=Object.freeze([...FIRST,...SECOND]);
const index=new Map(GEO_LIBRARY_CATALOG.map(entry=>[entry.id,entry]));
export function lookupGeoLibrary(id){return index.get(id)||null}
export function filterGeoLibraries(query='',category=''){
 const q=String(query).trim().toLocaleLowerCase();
 return GEO_LIBRARY_CATALOG.filter(item=>(!category||item.category===category)&&(!q||item.package.toLowerCase().includes(q)||item.category.toLowerCase().includes(q)));
}
