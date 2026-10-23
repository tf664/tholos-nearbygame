import { registerPlugin } from '@capacitor/core';

import type { NearbyConnectionPlugin } from './definitions';

const NearbyGame = registerPlugin<NearbyConnectionPlugin>(
  'NearbyGame',
);

export * from './definitions';
export { NearbyGame };
