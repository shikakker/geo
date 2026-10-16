// Curated extension catalog: exactly 100 *additional* npm projects, not auto-installed.
// npm availability, compatibility, licenses and versions are verified individually
// when activated via `npm run geo:add -- <name>`. Existing 30 packages are separate.
// Self-hosted code has no provider API quotas; public map/weather APIs still do.
export const GEO_LIBRARY_GROUPS=[
  [
    "Погода, время и координаты",
    [
      "suncalc",
      "astronomy-engine",
      "luxon",
      "date-fns",
      "date-fns-tz",
      "tz-lookup",
      "geodesy",
      "geolib"
    ]
  ],
  [
    "3D-графика и модели",
    [
      "three",
      "regl",
      "pixi.js",
      "gl-matrix",
      "meshoptimizer",
      "three-mesh-bvh",
      "@loaders.gl/core",
      "@loaders.gl/3d-tiles"
    ]
  ],
  [
    "Геоформаты и файлы",
    [
      "geotiff",
      "georaster",
      "georaster-layer-for-leaflet",
      "flatgeobuf",
      "shpjs",
      "shapefile",
      "@mapbox/shp-write",
      "@tmcw/togeojson",
      "topojson-client",
      "topojson-server",
      "topojson-simplify",
      "tokml",
      "wellknown"
    ]
  ],
  [
    "Пространственные индексы",
    [
      "h3-js",
      "s2-geometry",
      "ngeohash",
      "@mapbox/tiny-sdf",
      "delaunator",
      "d3-delaunay",
      "d3-quadtree",
      "robust-predicates",
      "latlon-geohash",
      "geokdbush"
    ]
  ],
  [
    "D3: карты и анимация",
    [
      "d3-contour",
      "d3-color",
      "d3-scale-chromatic",
      "d3-format",
      "d3-time",
      "d3-time-format",
      "d3-fetch",
      "d3-dsv",
      "d3-polygon",
      "d3-path",
      "d3-shape",
      "d3-dispatch",
      "d3-drag",
      "d3-timer",
      "d3-transition",
      "d3-zoom"
    ]
  ],
  [
    "Кеш, локальные данные, скорость",
    [
      "lru-cache",
      "quick-lru",
      "p-limit",
      "p-queue",
      "idb",
      "idb-keyval",
      "localforage",
      "dexie",
      "nanoid",
      "mitt",
      "eventemitter3",
      "fast-deep-equal",
      "fast-json-stable-stringify",
      "fflate"
    ]
  ],
  [
    "Математика и анализ",
    [
      "mathjs",
      "decimal.js",
      "big.js",
      "simple-statistics",
      "ml-kmeans",
      "ml-matrix",
      "seedrandom",
      "rbush-knn"
    ]
  ],
  [
    "Поиск, фильтры и валидация",
    [
      "fuse.js",
      "minisearch",
      "lunr",
      "flexsearch",
      "zod",
      "ajv"
    ]
  ],
  [
    "Turf: геоаналитика",
    [
      "@turf/center-of-mass",
      "@turf/circle",
      "@turf/clusters-dbscan",
      "@turf/convex",
      "@turf/concave",
      "@turf/boolean-contains",
      "@turf/boolean-within",
      "@turf/boolean-overlap",
      "@turf/line-intersect",
      "@turf/line-slice",
      "@turf/line-offset",
      "@turf/nearest-point-on-line",
      "@turf/point-to-line-distance",
      "@turf/points-within-polygon",
      "@turf/simplify",
      "@turf/hex-grid",
      "@turf/isobands"
    ]
  ]
];
export const GEO_LIBRARY_CATALOG=Object.freeze(GEO_LIBRARY_GROUPS.flatMap(([category,packages])=>
 packages.map(name=>Object.freeze({id:name,package:name,category,info:'https://www.npmjs.com/package/'+encodeURIComponent(name),status:'available-to-install'}))));
const byName=new Map(GEO_LIBRARY_CATALOG.map(entry=>[entry.id,entry]));
export function lookupGeoLibrary(id){return byName.get(id)||null}
export function filterGeoLibraries(query='',category=''){
 const q=String(query).trim().toLocaleLowerCase();
 return GEO_LIBRARY_CATALOG.filter(item=>(!category||item.category===category)&&(!q||item.id.toLowerCase().includes(q)||item.category.toLowerCase().includes(q)));
}
