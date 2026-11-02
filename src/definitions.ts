import type { PluginListenerHandle } from '@capacitor/core';

export interface NearbyPeer {
  endpointId: string;
  name: string;
}

export interface NearbyConnectionPlugin {
  startHosting(options: {
    serviceId: string;
    displayName: string;
  }): Promise<void>;

  stopHosting(): Promise<void>;

  startDiscovering(options: {
    serviceId: string;
  }): Promise<void>;

  stopDiscovering(): Promise<void>;

  requestConnection(options: {
    endpointId: string;
    displayName: string;
  }): Promise<void>;

  acceptConnection(options: {
    endpointId: string;
    accept: boolean;
  }): Promise<void>;

  sendMessage(options: {
    endpointId: string;
    message: string;
  }): Promise<void>;

  disconnect(options?: {
    endpointId?: string;
  }): Promise<void>;

  addListener(
    eventName: 'peerFound',
    listener: (peer: NearbyPeer) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'peerLost',
    listener: (peer: Pick<NearbyPeer, 'endpointId'>) => void,
  ): Promise<PluginListenerHandle>;

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
