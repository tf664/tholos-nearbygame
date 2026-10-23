import type { PluginListenerHandle } from '@capacitor/core';

export interface NearbyPeer {
  endpointId: string;
  name: string;
}

export interface NearbyConnectionPlugin {
  startHosting(options: { displayName: string }): Promise<void>;
  startDiscovering(options: { serviceId: string }): Promise<void>;

  requestConnection(options: {
    endpointId: string;
  }): Promise<void>;

  acceptConnection(options: {
    endpointId: string;
    accept: boolean;
  }): Promise<void>;

    sendMessage(options: {
      endpointId: string;
      message: string;
  }): Promise<void>;

  disconnect(): Promise<void>;

  addListener(
    eventName: 'connectionChanged',
    listener: (event: {
      endpointId: string;
      state: 'requested' | 'connected' | 'rejected' | 'disconnected';
      name?: string;
    }) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'messageReceived',
    listener: (event: {
      endpointId: string;
      message: string;
    }) => void,
  ): Promise<PluginListenerHandle>;

/*   echo(options: { value: string }): Promise<{ value: string }>; */
}


