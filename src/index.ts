import { registerPlugin } from '@capacitor/core';

import type { NearbyConnectionPlugin } from './definitions';

const NearbyGame = registerPlugin<NearbyConnectionPlugin>('NearbyGame', {
  web: () => import('./web').then((m) => new m.NearbyGameWeb()),
});

export * from './definitions';
export { NearbyGame };