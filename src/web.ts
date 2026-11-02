import { WebPlugin } from '@capacitor/core';

import type { NearbyConnectionPlugin } from './definitions';

export class NearbyGameWeb
  extends WebPlugin
  implements NearbyConnectionPlugin
{
  async startDiscovering(_options: { serviceId: string }): Promise<void> {
    throw this.unimplemented('Nearby discovery is only available on Android/iOS');
  }

  async stopDiscovering(): Promise<void> {
    throw this.unimplemented('Nearby discovery is only available on Android/iOS');
  }

  async startHosting(_options: {
    serviceId: string;
    displayName: string;
  }): Promise<void> {
    throw this.unimplemented('Nearby hosting is only available on Android/iOS');
  }

  async stopHosting(): Promise<void> {
    throw this.unimplemented('Nearby hosting is only available on Android/iOS');
  }

  async requestConnection(_options: {
    endpointId: string;
    displayName: string;
  }): Promise<void> {
    throw this.unimplemented('Nearby connections are only available on Android/iOS');
  }

  async acceptConnection(_options: {
    endpointId: string;
    accept: boolean;
  }): Promise<void> {
    throw this.unimplemented('Nearby connections are only available on Android/iOS');
  }

  async sendMessage(_options: {
    endpointId: string;
    message: string;
  }): Promise<void> {
    throw this.unimplemented('Nearby messaging is only available on Android/iOS');
  }

  async disconnect(_options?: { endpointId?: string }): Promise<void> {
    throw this.unimplemented('Nearby connections are only available on Android/iOS');
  }
}