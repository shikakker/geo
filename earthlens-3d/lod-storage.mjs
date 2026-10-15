import {isLodMode} from './cesium-lod.js';

/**
 * Browser storage may be disabled by a privacy setting or embedding sandbox.
 * Map bootstrap must not depend on persistent storage being available.
 * The provider is lazy so even accessing window.localStorage is guarded.
 */
export function readStoredLod(getStorage = () => window.localStorage) {
  try {
    const value = getStorage()?.getItem('earthlens:lod');
    return isLodMode(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}
