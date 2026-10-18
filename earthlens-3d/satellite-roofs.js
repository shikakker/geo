import earcut from 'earcut';

// One and the same Web-Mercator imagery grid is used for the ground and roofs.
// Source attribution remains visible in the MapLibre raster source.
export const WORLD_IMAGERY_TILE_URL =
 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const WORLD_IMAGERY_ATTRIBUTION =
 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community';
export const SATELLITE_ROOF_LAYER_ID = 'earthlens-3d-satellite-roofs';

const RAD = Math.PI / 180;
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;
const ATLAS_TILES = 4;
const TILE_SIZE = 256;
const MIN_ZOOM = 15.2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function webMercator(lon, lat) {
 const latitude = clamp(Number(lat), -85.05112878, 85.05112878) * RAD;
 return {
  x: (Number(lon) + 180) / 360,
  y: (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2
 };
}

export function imageryTile(lon, lat, zoom) {
 const z = clamp(Math.floor(zoom), 0, 20);
 const point = webMercator(lon, lat);
 const scale = 2 ** z;
 return {x: point.x * scale, y: point.y * scale, z};
}

export function imageryAtlasFor(lon, lat, zoom) {
 const tile = imageryTile(lon, lat, zoom);
 // Each shared 4x4 tile atlas contains a one-tile guard band around a
 // 2x2 tile core, so buildings crossing tile boundaries are not stretched.
 const x = Math.floor(tile.x / 2) * 2 - 1;
 const y = Math.floor(tile.y / 2) * 2 - 1;
 return {x, y, z: tile.z, key: tile.z + '/' + x + '/' + y};
}

export function imageryUV(lon, lat, atlas) {
 const tile = imageryTile(lon, lat, atlas.z);
 return [(tile.x - atlas.x) / ATLAS_TILES,
  (tile.y - atlas.y) / ATLAS_TILES];
}

export function imageryURL(x, y, z) {
 const size = 2 ** z;
 if(y < 0 || y >= size) return null;
 return WORLD_IMAGERY_TILE_URL
  .replace('{z}', String(z))
  .replace('{y}', String(y))
  .replace('{x}', String(((x % size) + size) % size));
}

export function roofHeight(properties = {}) {
 const height = Number(properties.render_height ?? properties.height);
 const base = Number(properties.render_min_height ?? properties.min_height);
 const resolvedHeight = Number.isFinite(height) && height > 0 ? height : 12;
 const resolvedBase = Number.isFinite(base) && base >= 0 ? base : 0;
 return resolvedHeight > resolvedBase ? resolvedHeight : null;
}

function polygonsOf(geometry) {
 if(!geometry) return [];
 if(geometry.type === 'Polygon') return [geometry.coordinates];
 if(geometry.type === 'MultiPolygon') return geometry.coordinates;
 return [];
}

function cleanedRing(ring) {
 if(!Array.isArray(ring)) return [];
 const valid = ring.filter(point => Array.isArray(point) &&
  Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
  Math.abs(point[1]) <= 85.05112878);
 if(valid.length > 3) {
  const first = valid[0], last = valid[valid.length - 1];
  if(first[0] === last[0] && first[1] === last[1]) return valid.slice(0, -1);
 }
 return valid;
}

function polygonCenter(rings) {
 const ring = cleanedRing(rings?.[0]);
 if(ring.length < 3) return null;
 let x = 0, y = 0;
 for(const point of ring) { x += point[0]; y += point[1]; }
 return {lon: x / ring.length, lat: y / ring.length};
}

// Pure geometry builder: world-anchored Mercator XY, real satellite XYZ UV,
// fixed roof elevation and earcut triangulation with interior courtyards.
export function triangulateSatelliteRoof(rings, atlas, origin, heightMeters) {
 if(!Array.isArray(rings) || !Number.isFinite(heightMeters)) return null;
 const flat = [], holes = [], vertices = [];
 let count = 0;
 const exterior = polygonCenter(rings);
 if(!exterior) return null;
 const latitude = clamp(exterior.lat, -85, 85) * RAD;
 const mercatorAltitude = heightMeters /
  (EARTH_CIRCUMFERENCE * Math.cos(latitude));
 for(const raw of rings) {
  const ring = cleanedRing(raw);
  if(ring.length < 3 || ring.length > 1500) continue;
  if(count > 0) holes.push(count);
  for(const point of ring) {
   const xy = webMercator(point[0], point[1]);
   const uv = imageryUV(point[0], point[1], atlas);
   // Do not clamp or repeat satellite data: an out-of-bounds mesh would
   // otherwise show a different building's roof or stretched pixels.
   if(uv[0] < 0 || uv[0] > 1 || uv[1] < 0 || uv[1] > 1) return null;
   flat.push(xy.x, xy.y);
   vertices.push(xy.x - origin.x, xy.y - origin.y, mercatorAltitude,
    uv[0], uv[1]);
   count++;
  }
 }
 if(count < 3 || count > 2400) return null;
 const triangles = earcut(flat, holes, 2);
 if(!triangles.length) return null;
 const out = new Float32Array(triangles.length * 5);
 for(let i = 0; i < triangles.length; i++) {
  const idx = triangles[i] * 5;
  out.set(vertices.slice(idx, idx + 5), i * 5);
 }
 return out;
}

export function satelliteProjectionMatrix(matrix, origin) {
 // Multiplication by translation in double precision avoids jitter at
 // high zoom. Vertex buffers store only small offsets from the map center.
 if(!matrix || matrix.length !== 16) return null;
 const out = new Float32Array(matrix);
 for(let row = 0; row < 4; row++) {
  out[12 + row] = matrix[row] * origin.x + matrix[4 + row] * origin.y +
   matrix[12 + row];
 }
 return out;
}

const VERTEX_SHADER = `
precision highp float;
attribute vec3 a_position;
attribute vec2 a_uv;
uniform mat4 u_matrix;
varying highp vec2 v_uv;
void main() {
 v_uv = a_uv;
 gl_Position = u_matrix * vec4(a_position, 1.0);
}`;
const FRAGMENT_SHADER = `
precision mediump float;
varying highp vec2 v_uv;
uniform sampler2D u_atlas;
uniform float u_opacity;
void main() {
 vec3 color = texture2D(u_atlas, v_uv).rgb;
 gl_FragColor = vec4(color, u_opacity);
}`;

function compile(gl, type, source) {
 const shader = gl.createShader(type);
 gl.shaderSource(shader, source);
 gl.compileShader(shader);
 if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
  const error = gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  throw Error('Satellite roof shader: ' + error);
 }
 return shader;
}

function createProgram(gl) {
 const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
 const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
 const program = gl.createProgram();
 gl.attachShader(program, vertex); gl.attachShader(program, fragment);
 gl.linkProgram(program);
 gl.deleteShader(vertex); gl.deleteShader(fragment);
 if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  const message = gl.getProgramInfoLog(program);
  gl.deleteProgram(program);
  throw Error('Satellite roof program: ' + message);
 }
 return program;
}

async function decodedImage(blob) {
 if(typeof createImageBitmap === 'function') return createImageBitmap(blob);
 const url = URL.createObjectURL(blob);
 try {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
 } finally { URL.revokeObjectURL(url); }
}

async function loadAtlasPixels(entry, signal) {
 const canvas = document.createElement('canvas');
 canvas.width = canvas.height = ATLAS_TILES * TILE_SIZE;
 const ctx = canvas.getContext('2d', {alpha:false});
 if(!ctx) throw Error('Canvas 2D unavailable');
 let next = 0;
 const workers = Array.from({length:4}, async () => {
  while(next < ATLAS_TILES * ATLAS_TILES) {
   const index = next++;
   if(signal.aborted) throw Error('Imagery request cancelled');
   const col = index % ATLAS_TILES, row = Math.floor(index / ATLAS_TILES);
   const url = imageryURL(entry.x + col, entry.y + row, entry.z);
   if(!url) throw Error('Imagery outside valid latitude');
   // The browser/HTTP cache may reuse the same tile as the ground layer.
   // No persistent or bulk satellite imagery archive is created.
   const response = await fetch(url, {mode:'cors', signal});
   if(!response.ok) throw Error('Satellite tile HTTP ' + response.status);
   const image = await decodedImage(await response.blob());
   try { ctx.drawImage(image, col * TILE_SIZE, row * TILE_SIZE,
    TILE_SIZE, TILE_SIZE); }
   finally { image.close?.(); }
  }
 });
 await Promise.all(workers);
 if(signal.aborted) throw Error('Imagery request cancelled');
 return canvas;
}

function onSmallDevice() {
 return (typeof window !== 'undefined' && window.innerWidth < 700) ||
  (typeof navigator !== 'undefined' && navigator.deviceMemory <= 4);
}

export function createSatelliteRoofProjection(map, {getQuality=()=> 'smooth'} = {}) {
 let enabled = false, program = null, glContext = null, scheduleTimer = null;
 let activeLoads = 0, lastView = '', roofCount = 0, idleAttempts = 0;
 let origin = {x:0, y:0}, groups = new Map(), atlasEpoch = 0;
 const entries = new Map(), queue = [];
 const mobile = onSmallDevice();
 const maxAtlases = mobile ? 2 : 4;
 const maxRoofs = mobile ? 100 : 280;
 const maxConcurrent = mobile ? 1 : 2;
 const layer = {
  id: SATELLITE_ROOF_LAYER_ID,
  type: 'custom',
  renderingMode: '3d',
  onAdd(_map, gl) {
   glContext = gl;
   try { program = createProgram(gl); }
   catch(error) { console.warn(error); program = null; }
  },
  render(gl, options) {
   if(!enabled || !program || !groups.size) return;
   const matrix = satelliteProjectionMatrix(
    options?.defaultProjectionData?.mainMatrix, origin);
   if(!matrix) return;
   const now = performance.now();
   gl.useProgram(program);
   gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_matrix'),
    false, matrix);
   gl.uniform1i(gl.getUniformLocation(program, 'u_atlas'), 0);
   const alphaLocation = gl.getUniformLocation(program, 'u_opacity');
   const positionLocation = gl.getAttribLocation(program, 'a_position');
   const uvLocation = gl.getAttribLocation(program, 'a_uv');
   gl.enable(gl.DEPTH_TEST);
   gl.depthFunc(gl.LEQUAL);
   gl.depthMask(false);
   gl.enable(gl.BLEND);
   gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
   gl.disable(gl.CULL_FACE);
   let fading = false;
   for(const [key, group] of groups) {
    const atlas = entries.get(key);
    if(!atlas?.canvas) continue; // Colored 3D roof stays until photo is ready.
    if(!atlas.texture) {
     const texture = gl.createTexture();
     gl.activeTexture(gl.TEXTURE0);
     gl.bindTexture(gl.TEXTURE_2D, texture);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
     gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
      gl.UNSIGNED_BYTE, atlas.canvas);
     gl.generateMipmap(gl.TEXTURE_2D);
     atlas.texture = texture;
    }
    if(!group.buffer) {
     group.buffer = gl.createBuffer();
     gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
     gl.bufferData(gl.ARRAY_BUFFER, group.data, gl.STATIC_DRAW);
    }
    const progress = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
     ? 1 : Math.min(1, (now - atlas.readyAt) / 650);
    if(progress < 1) fading = true;
    gl.uniform1f(alphaLocation, progress * 0.98);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 20, 12);
    gl.drawArrays(gl.TRIANGLES, 0, group.data.length / 5);
   }
   gl.disableVertexAttribArray(positionLocation);
   gl.disableVertexAttribArray(uvLocation);
   gl.bindBuffer(gl.ARRAY_BUFFER, null);
   gl.bindTexture(gl.TEXTURE_2D, null);
   gl.depthMask(true);
   if(fading) map.triggerRepaint();
  },
  onRemove(_map, gl) {
   for(const group of groups.values()) if(group.buffer) {
    gl.deleteBuffer(group.buffer); group.buffer = null;
   }
   for(const item of entries.values()) if(item.texture) {
    gl.deleteTexture(item.texture); item.texture = null;
   }
   if(program) gl.deleteProgram(program);
   program = null; glContext = null;
  }
 };

 function discardGroups() {
  if(glContext) for(const group of groups.values()) if(group.buffer)
   glContext.deleteBuffer(group.buffer);
  groups = new Map();
 }

 function releaseAtlas(item) {
  item.controller?.abort();
  if(item.texture && glContext) glContext.deleteTexture(item.texture);
  item.texture = null;
  item.canvas = null;
  entries.delete(item.key);
 }

 function clearAll() {
  atlasEpoch++;
  if(scheduleTimer !== null) clearTimeout(scheduleTimer);
  scheduleTimer = null;
  for(const entry of entries.values()) releaseAtlas(entry);
  queue.length = 0;
  discardGroups();
  roofCount = 0; lastView = '';
 }

 function pump() {
  while(activeLoads < maxConcurrent && queue.length) {
   const entry = queue.shift();
   if(!enabled || !entries.has(entry.key) || entry.controller) continue;
   const controller = new AbortController();
   entry.controller = controller;
   const requestEpoch = atlasEpoch;
   activeLoads++;
   const timeout = setTimeout(() => controller.abort(), 14000);
   loadAtlasPixels(entry, controller.signal).then(canvas => {
    if(requestEpoch !== atlasEpoch || entries.get(entry.key) !== entry ||
       !enabled) return;
    entry.canvas = canvas;
    entry.readyAt = performance.now();
    map.triggerRepaint();
   }).catch(error => {
    if(!controller.signal.aborted) {
     entry.failed = true;
     console.warn('Satellite roof imagery unavailable:', error.message);
    }
   }).finally(() => {
    clearTimeout(timeout);
    activeLoads--;
    pump();
   });
  }
 }

 function queueAtlases(desired) {
  const keys = new Set(desired.keys());
  for(const entry of [...entries.values()])
   if(!keys.has(entry.key)) releaseAtlas(entry);
  for(const [key, atlas] of desired) {
   if(!entries.has(key)) {
    const entry = {...atlas, canvas:null, texture:null, controller:null,
     failed:false, readyAt:0};
    entries.set(key, entry);
    queue.push(entry);
   }
  }
  pump();
 }

 function refresh(force=false) {
  if(!enabled || !map.getLayer?.('earthlens-3d-buildings') ||
     map.getZoom() < MIN_ZOOM) {
   if(groups.size || entries.size) clearAll();
   return;
  }
  const center = map.getCenter(), zoom = map.getZoom();
  const view = [center.lng.toFixed(5), center.lat.toFixed(5),
   zoom.toFixed(2), getQuality()].join(':');
  if(!force && view === lastView) return;
  lastView = view;
  const tileZoom = clamp(Math.floor(zoom) + 1, 16, 18);
  let features = [];
  try {
   features = map.queryRenderedFeatures({
    layers: ['earthlens-3d-buildings']
   }) || [];
  } catch(error) {
   console.debug('Satellite roofs: building data pending', error);
   return;
  }
  const candidates = [];
  const seen = new Set();
  for(const feature of features) {
   if(feature.properties?.hide_3d === true) continue;
   const height = roofHeight(feature.properties);
   if(height === null) continue;
   for(const polygon of polygonsOf(feature.geometry)) {
    const centerPoint = polygonCenter(polygon);
    if(!centerPoint || Math.abs(centerPoint.lat) > 85) continue;
    const signature = [feature.id ?? feature.properties?.id ?? '',
     centerPoint.lon.toFixed(6), centerPoint.lat.toFixed(6),
     polygon[0]?.length].join(':');
    if(seen.has(signature)) continue;
    seen.add(signature);
    const atlas = imageryAtlasFor(centerPoint.lon, centerPoint.lat,
     tileZoom);
    const dx = ((centerPoint.lon - center.lng + 540) % 360) - 180;
    const dy = centerPoint.lat - center.lat;
    const distance = dx * dx * Math.cos(center.lat * RAD) ** 2 +
     dy * dy;
    candidates.push({polygon, centerPoint, height, atlas, distance});
   }
  }
  candidates.sort((a,b) => a.distance - b.distance);
  // A fixed camera-local origin is used for every atlas group in the frame.
  origin = webMercator(center.lng, center.lat);
  const desired = new Map(), rawGroups = new Map();
  const maxObjects = getQuality() === 'detail' ? maxRoofs : Math.ceil(maxRoofs * .75);
  let accepted = 0;
  for(const candidate of candidates) {
   if(accepted >= maxObjects) break;
   const {atlas, polygon, centerPoint, height} = candidate;
   if(!desired.has(atlas.key) && desired.size >= maxAtlases) continue;
   const ground = map.queryTerrainElevation?.(
    [centerPoint.lon, centerPoint.lat]);
   // Ground elevation is already terrain-exaggerated by MapLibre. The
   // positive epsilon keeps the photograph above the extrusion roof.
   const elevation = Number.isFinite(ground) ? ground : 0;
   const data = triangulateSatelliteRoof(polygon, atlas, origin,
    elevation + height + 0.8);
   if(!data) continue;
   desired.set(atlas.key, atlas);
   if(!rawGroups.has(atlas.key)) rawGroups.set(atlas.key, []);
   rawGroups.get(atlas.key).push(data);
   accepted++;
  }
  discardGroups();
  for(const [key, arrays] of rawGroups) {
   const len = arrays.reduce((sum, array) => sum + array.length, 0);
   const result = new Float32Array(len);
   let offset = 0;
   for(const array of arrays) { result.set(array, offset); offset += array.length; }
   groups.set(key, {data:result, buffer:null});
  }
  roofCount = accepted;
  queueAtlases(desired);
  map.triggerRepaint();
 }

 function schedule(force=false, delay=150) {
  if(!enabled) return;
  if(scheduleTimer !== null) clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => {
   scheduleTimer = null;
   refresh(force);
  }, delay);
 }
 const onMoveEnd = () => { idleAttempts = 0; schedule(); };
 const onIdle = () => {
  if(enabled && roofCount === 0 && idleAttempts++ < 3)
   schedule(true, 110);
 };
 map.on('moveend', onMoveEnd);
 map.on('idle', onIdle);

 return {
  setEnabled(next) {
   const target = Boolean(next);
   if(enabled === target) { if(target) this.ensure(); return; }
   enabled = target;
   if(!enabled) {
    if(map.getLayer?.(SATELLITE_ROOF_LAYER_ID))
     map.removeLayer(SATELLITE_ROOF_LAYER_ID);
    clearAll();
   } else this.ensure();
  },
  ensure() {
   if(!enabled || !map.isStyleLoaded?.() ||
      !map.getLayer?.('earthlens-3d-buildings')) return;
   if(!map.getLayer(SATELLITE_ROOF_LAYER_ID)) {
    const firstLabel = map.getStyle().layers.find(
     item => item.type === 'symbol')?.id;
    try { map.addLayer(layer, firstLabel); }
    catch(error) { console.warn('Satellite roof renderer:', error); return; }
   }
   schedule(true, 80);
  },
  stats() {
   return {enabled, roofs:roofCount, atlases:entries.size,
    ready:[...entries.values()].filter(entry => entry.canvas).length,
    loading:activeLoads, layer:Boolean(map.getLayer?.(SATELLITE_ROOF_LAYER_ID))};
  },
  destroy() {
   enabled = false;
   map.off?.('moveend', onMoveEnd);
   map.off?.('idle', onIdle);
   if(map.getLayer?.(SATELLITE_ROOF_LAYER_ID))
    map.removeLayer(SATELLITE_ROOF_LAYER_ID);
   clearAll();
  }
 };
}
