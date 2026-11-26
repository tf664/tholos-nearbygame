import type { PluginListenerHandle } from '@capacitor/core';

import type { NearbyConnectionPlugin, NearbyPeer } from './definitions';

export type NearbySessionRole = 'host' | 'guest';
export type NearbySessionStatus = 'idle' | 'hosting' | 'discovering' | 'requested' | 'connected' | 'rejected' | 'disconnected';

export interface NearbySessionSnapshot<TMember, TState> {
  role: NearbySessionRole | null;
  status: NearbySessionStatus;
  peers: NearbyPeer[];
  members: TMember[];
  state: TState | null;
  localMember: TMember | null;
  hostEndpointId: string | null;
  gameStarted: boolean;
  error: string | null;
}

export type MemberValidation<TMember> = { member: TMember } | { error: string };

export interface NearbyGameSessionOptions<TMember extends { id: string }, TState> {
  serviceId: string;
  displayName(member: TMember): string;
  validateMember(value: unknown, currentMembers: readonly TMember[]): MemberValidation<TMember>;
  parseState(value: unknown): TState | null;
  addMember(state: TState, member: TMember): TState;
  updateMember(state: TState, member: TMember): TState;
  removeMember(state: TState, memberId: string): TState;
  applyStateUpdate(currentState: TState, proposedState: unknown, member: TMember): TState | null;
  minimumPlayers?: number;
}

interface SessionMessage {
  version: 1;
  type: string;
  payload?: unknown;
}

export class NearbyGameSession<TMember extends { id: string }, TState> {
  private snapshot: NearbySessionSnapshot<TMember, TState> = {
    role: null,
    status: 'idle',
    peers: [],
    members: [],
    state: null,
    localMember: null,
    hostEndpointId: null,
    gameStarted: false,
    error: null,
  };

  private readonly subscribers = new Set<(snapshot: NearbySessionSnapshot<TMember, TState>) => void>();

  private readonly endpointMembers = new Map<string, string>();
  private listenerHandles: PluginListenerHandle[] = [];
  private listenerSetup: Promise<void> | null = null;
  private startingGame = false;

  constructor(
    private readonly plugin: NearbyConnectionPlugin,
    private readonly options: NearbyGameSessionOptions<TMember, TState>,
  ) {}

  subscribe(subscriber: (snapshot: NearbySessionSnapshot<TMember, TState>) => void): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot);
    return () => this.subscribers.delete(subscriber);
  }

  async host(member: TMember, initialState: TState): Promise<void> {
    const validation = this.options.validateMember(member, []);
    const state = this.options.parseState(initialState);
    if ('error' in validation || state === null) {
      this.fail('Invalid host session setup', 'error' in validation ? validation.error : 'Initial state is invalid.');
      return;
    }

    this.reset({
      role: 'host',
      status: 'idle',
      members: [validation.member],
      state,
      localMember: validation.member,
    });

    try {
      await this.ensureListeners();
      await this.plugin.startHosting({
        serviceId: this.options.serviceId,
        displayName: this.options.displayName(validation.member),
      });
      this.publish({ status: 'hosting' });
    } catch (error) {
      this.fail('Could not start hosting', error);
    }
  }

  async discover(member: TMember): Promise<void> {
    const validation = this.options.validateMember(member, []);
    if ('error' in validation) {
      this.fail('Invalid player profile', validation.error);
      return;
    }

    this.reset({
      role: 'guest',
      status: 'idle',
      localMember: validation.member,
    });

    try {
      await this.ensureListeners();
      await this.plugin.startDiscovering({ serviceId: this.options.serviceId });
      this.publish({ status: 'discovering' });
    } catch (error) {
      this.fail('Could not search for games', error);
    }
  }

  async connect(endpointId: string): Promise<void> {
    const member = this.snapshot.localMember;
    if (this.snapshot.role !== 'guest' || !member) {
      this.setError('Set up a player before connecting.');
      return;
    }

    try {
      await this.plugin.requestConnection({
        endpointId,
        displayName: this.options.displayName(member),
      });
    } catch (error) {
      this.fail('Could not request a connection', error);
    }
  }

  async updateProfile(member: TMember): Promise<void> {
    const ownId = this.snapshot.localMember?.id;
    if (!ownId || member.id !== ownId) {
      this.setError('The player profile does not match this session.');
      return;
    }

    const otherMembers = this.snapshot.members.filter((item) => item.id !== ownId);
    const validation = this.options.validateMember(member, otherMembers);
    if ('error' in validation) {
      this.setError(validation.error);
      return;
    }

    const updatedMember = validation.member;
    if (this.snapshot.role === 'host') {
      const state = this.snapshot.state;
      if (state === null) {
        this.setError('The host session has no game state.');
        return;
      }

      this.publish({
        localMember: updatedMember,
        members: this.snapshot.members.map((item) => (item.id === ownId ? updatedMember : item)),
        state: this.options.updateMember(state, updatedMember),
        error: null,
      });
      await this.broadcastSnapshot();
      return;
    }

    if (this.snapshot.role === 'guest' && this.snapshot.hostEndpointId) {
      this.publish({ localMember: updatedMember, error: null });
      await this.sendTo(this.snapshot.hostEndpointId, 'register', {
        member: updatedMember,
      });
    }
  }

  async startGame(): Promise<void> {
    if (this.startingGame || this.snapshot.gameStarted) return;
    if (
      this.snapshot.role !== 'host' ||
      this.snapshot.members.length < (this.options.minimumPlayers ?? 2) ||
      this.snapshot.state === null
    ) {
      this.setError('Not enough players to start the game.');
      return;
    }

    this.startingGame = true;
    try {
      await Promise.all(
        Array.from(this.endpointMembers.keys()).map((endpointId) =>
          this.sendTo(endpointId, 'start-game', this.sessionPayload()),
        ),
      );
      this.publish({ gameStarted: true, error: null });
    } catch (error) {
      this.fail('Could not start the game on every connected device', error);
    } finally {
      this.startingGame = false;
    }
  }

  async updateState(state: TState): Promise<void> {
    const parsedState = this.options.parseState(state);
    if (parsedState === null) {
      this.setError('The game state is invalid.');
      return;
    }

    if (this.snapshot.role === 'host') {
      this.publish({ state: parsedState, error: null });
      await this.broadcastSnapshot();
      return;
    }

    if (this.snapshot.role === 'guest' && this.snapshot.hostEndpointId) {
      this.publish({ state: parsedState, error: null });
      await this.sendTo(this.snapshot.hostEndpointId, 'state-update', {
        state: parsedState,
      });
    }
  }

  async stop(): Promise<void> {
    const results = await Promise.all(
      [
        this.plugin.stopHosting(),
        this.plugin.stopDiscovering(),
        this.plugin.disconnect(),
        ...this.listenerHandles.map((handle) => handle.remove()),
      ].map(async (operation) => {
        try {
          await operation;
          return null;
        } catch (error) {
          return this.describeError(error);
        }
      }),
    );
    this.listenerHandles = [];
    this.listenerSetup = null;
    this.endpointMembers.clear();
    this.startingGame = false;
    this.reset();

    const failures = results.filter((result): result is string => result !== null);
    if (failures.length > 0) {
      this.setError(`Could not fully stop the session: ${failures.join('; ')}`);
    }
  }

  private async ensureListeners(): Promise<void> {
    if (this.listenerSetup) return this.listenerSetup;

    this.listenerSetup = (async () => {
      this.listenerHandles = await Promise.all([
        this.plugin.addListener('peerFound', (peer) => {
          if (!this.snapshot.peers.some((item) => item.endpointId === peer.endpointId)) {
            this.publish({ peers: [...this.snapshot.peers, peer] });
          }
        }),
        this.plugin.addListener('peerLost', (peer) => {
          this.publish({
            peers: this.snapshot.peers.filter((item) => item.endpointId !== peer.endpointId),
          });
        }),
        this.plugin.addListener('connectionChanged', (event) => {
          void this.handleConnectionChanged(event).catch((error) =>
            this.fail('Nearby connection handling failed', error),
          );
        }),
        this.plugin.addListener('messageReceived', (event) => {
          void this.handleMessage(event.endpointId, event.message).catch((error) =>
            this.fail('Nearby message handling failed', error),
          );
        }),
      ]);
    })();

    try {
      await this.listenerSetup;
    } catch (error) {
      this.listenerSetup = null;
      this.fail('Could not register Nearby listeners', error);
      throw error;
    }
  }

  private async handleConnectionChanged(event: {
    endpointId: string;
    state: 'requested' | 'connected' | 'rejected' | 'disconnected';
    name?: string;
  }): Promise<void> {
    this.publish({ status: event.state });

    if (event.state === 'requested') {
      await this.plugin.acceptConnection({
        endpointId: event.endpointId,
        accept: true,
      });
      return;
    }

    if (event.state === 'connected') {
      if (this.snapshot.role === 'guest' && this.snapshot.localMember) {
        this.publish({ hostEndpointId: event.endpointId });
        await this.sendTo(event.endpointId, 'register', {
          member: this.snapshot.localMember,
        });
      }
      return;
    }

    if (event.state === 'disconnected' || event.state === 'rejected') {
      const memberId = this.endpointMembers.get(event.endpointId);
      this.endpointMembers.delete(event.endpointId);
      const state = this.snapshot.state;
      const members = this.snapshot.members.filter((member) => member.id !== memberId);
      this.publish({
        members,
        state: memberId && state !== null ? this.options.removeMember(state, memberId) : state,
        hostEndpointId: this.snapshot.hostEndpointId === event.endpointId ? null : this.snapshot.hostEndpointId,
        error:
          event.state === 'rejected'
            ? 'The connection was rejected.'
            : this.snapshot.role === 'guest'
              ? 'The host disconnected.'
              : this.snapshot.error,
      });
      if (this.snapshot.role === 'host') await this.broadcastSnapshot();
    }
  }

  private async handleMessage(endpointId: string, message: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      this.fail('Received invalid session data', error);
      return;
    }

    if (!this.isRecord(parsed) || parsed.version !== 1 || typeof parsed.type !== 'string') {
      this.setError('Received an unsupported session message.');
      return;
    }

    const payload = parsed.payload;
    if (this.snapshot.role === 'guest' && endpointId !== this.snapshot.hostEndpointId) {
      return;
    }

    switch (parsed.type) {
      case 'register':
        await this.handleRegistration(endpointId, payload);
        break;
      case 'profile-accepted':
        this.publish({ error: null });
        break;
      case 'profile-rejected':
        this.setError(
          this.isRecord(payload) && typeof payload.reason === 'string'
            ? payload.reason
            : 'The host rejected this profile.',
        );
        break;
      case 'snapshot':
      case 'start-game':
        await this.receiveSnapshot(payload, parsed.type === 'start-game');
        break;
      case 'state-update':
        await this.handleStateUpdate(endpointId, payload);
        break;
      case 'state-rejected':
        await this.receiveSnapshot(payload, false);
        this.setError(
          this.isRecord(payload) && typeof payload.reason === 'string'
            ? payload.reason
            : 'The host rejected the update.',
        );
        break;
      default:
        this.setError('Received an unknown session message.');
    }
  }

  private async handleRegistration(endpointId: string, payload: unknown): Promise<void> {
    if (this.snapshot.role !== 'host' || !this.isRecord(payload)) return;

    const oldMemberId = this.endpointMembers.get(endpointId);
    const currentMembers = this.snapshot.members;
    const requestedMemberId =
      this.isRecord(payload.member) && typeof payload.member.id === 'string' ? payload.member.id : null;
    const existingId = currentMembers.find((member) => member.id === requestedMemberId && member.id !== oldMemberId);
    if (existingId) {
      await this.rejectProfile(endpointId, 'This player is already connected.');
      return;
    }

    const availableMembers = currentMembers.filter((member) => member.id !== oldMemberId);
    const validation = this.options.validateMember(payload.member, availableMembers);
    if ('error' in validation) {
      await this.rejectProfile(endpointId, validation.error);
      return;
    }

    const member = validation.member;
    if (oldMemberId && oldMemberId !== member.id) {
      await this.rejectProfile(endpointId, 'The player ID cannot be changed.');
      return;
    }

    const state = this.snapshot.state;
    if (state === null) {
      this.setError('The host session has no game state.');
      return;
    }

    const members = oldMemberId
      ? currentMembers.map((item) => (item.id === member.id ? member : item))
      : [...currentMembers, member];
    const nextState = oldMemberId ? this.options.updateMember(state, member) : this.options.addMember(state, member);
    this.endpointMembers.set(endpointId, member.id);
    this.publish({ members, state: nextState, error: null });
    await this.sendTo(endpointId, 'profile-accepted', {});
    await this.broadcastSnapshot();

    if (this.snapshot.gameStarted) {
      await this.sendTo(endpointId, 'start-game', this.sessionPayload());
    }
  }

  private async rejectProfile(endpointId: string, reason: string): Promise<void> {
    await this.sendTo(endpointId, 'profile-rejected', { reason });
    await this.sendTo(endpointId, 'snapshot', this.sessionPayload());
  }

  private async receiveSnapshot(payload: unknown, startGame: boolean): Promise<void> {
    if (this.snapshot.role !== 'guest' || !this.isRecord(payload) || !Array.isArray(payload.members)) {
      this.setError('Received an invalid session snapshot.');
      return;
    }

    const members: TMember[] = [];
    for (const candidate of payload.members) {
      const validation = this.options.validateMember(candidate, members);
      if ('error' in validation) {
        this.setError('Received an invalid player list from the host.');
        return;
      }
      members.push(validation.member);
    }

    const state = this.options.parseState(payload.state);
    if (state === null) {
      this.setError('Received an invalid game state from the host.');
      return;
    }
    if (startGame && !members.some((member) => member.id === this.snapshot.localMember?.id)) {
      this.setError('The host started a game without this player in the roster.');
      return;
    }

    const accepted = members.some((member) => member.id === this.snapshot.localMember?.id);
    this.publish({
      members,
      state,
      gameStarted: startGame || this.snapshot.gameStarted,
      error: accepted ? null : this.snapshot.error,
    });
  }

  private async handleStateUpdate(endpointId: string, payload: unknown): Promise<void> {
    if (this.snapshot.role !== 'host' || !this.isRecord(payload) || this.snapshot.state === null) {
      return;
    }

    const memberId = this.endpointMembers.get(endpointId);
    const member = this.snapshot.members.find((item) => item.id === memberId);
    const nextState = member ? this.options.applyStateUpdate(this.snapshot.state, payload.state, member) : null;
    if (nextState === null) {
      const reason = 'The player update was invalid.';
      await this.sendTo(endpointId, 'state-rejected', {
        reason,
        ...this.sessionPayload(),
      });
      return;
    }

    this.publish({ state: nextState, error: null });
    await this.broadcastSnapshot();
  }

  private sessionPayload(): { members: TMember[]; state: TState | null } {
    return {
      members: this.snapshot.members,
      state: this.snapshot.state,
    };
  }

  private async broadcastSnapshot(): Promise<void> {
    await Promise.all(
      Array.from(this.endpointMembers.keys()).map((endpointId) =>
        this.sendTo(endpointId, 'snapshot', this.sessionPayload()),
      ),
    );
  }

  private async sendTo(endpointId: string, type: string, payload: unknown): Promise<void> {
    const message: SessionMessage = { version: 1, type, payload };
    await this.plugin.sendMessage({
      endpointId,
      message: JSON.stringify(message),
    });
  }

  private publish(values: Partial<NearbySessionSnapshot<TMember, TState>>): void {
    this.snapshot = { ...this.snapshot, ...values };
    for (const subscriber of this.subscribers) subscriber(this.snapshot);
  }

  private reset(values: Partial<NearbySessionSnapshot<TMember, TState>> = {}): void {
    this.endpointMembers.clear();
    this.startingGame = false;
    this.snapshot = {
      role: null,
      status: 'idle',
      peers: [],
      members: [],
      state: null,
      localMember: null,
      hostEndpointId: null,
      gameStarted: false,
      error: null,
      ...values,
    };
    for (const subscriber of this.subscribers) subscriber(this.snapshot);
  }

  private setError(error: string): void {
    this.publish({ error });
  }

  private fail(context: string, error: unknown): void {
    this.setError(`${context}: ${this.describeError(error)}`);
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
