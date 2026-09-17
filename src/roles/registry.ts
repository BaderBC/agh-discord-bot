import { loadIds } from '../config/ids.js';
import { loadKierunki } from '../config/kierunki.js';
import { buildRegistryFromData } from './registry-data.js';
export * from './registry-data.js';

/** Local setup/Gateway loader. Workers use the bundled registry. */
export function buildRegistry() {
  return buildRegistryFromData(loadIds(), loadKierunki());
}
