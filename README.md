# tholos-nearbygame

Capacitor plugin for hosting and managing a lightweight game session over
Google Nearby Connections. It can discover nearby peers, establish a
connection, and exchange UTF-8 text messages.

> **Platform status:** Nearby Connections is currently implemented on Android.
> The web implementation rejects Nearby operations as unsupported, and the
> iOS implementation does not expose the Nearby API yet.

## Requirements

- A Capacitor application
- Capacitor 8 or later
- The Capacitor CLI installed in the consuming application
- Android API level 24 or later
- A physical Android device with Bluetooth and nearby-device permissions

Nearby Connections is not reliably testable in an emulator. Use two physical
Android devices when testing discovery and connections.

## Install in another Capacitor project

Run these commands from the root of the **consuming Capacitor application**,
not from a checkout of this plugin:

```bash
npm install @capacitor/cli
```

Then install the package:

```bash
npm install tholos-nearbygame
```

Then copy the native plugin into the Android and iOS projects:

```bash
npx cap sync
```

`npx cap sync` and `npx cap copy android` only work in a Capacitor
application that contains a `capacitor.config.*` file. They are not package
build commands and are not expected to work from this repository's root.

After installing or updating the plugin, rebuild the native application:

```bash
npx cap run android
```

The Android manifest permissions are included by the plugin. The application
must still allow the runtime permission request when the plugin starts its
first operation.

# TODO

write a pipeline/bash script for:
Edit package
↓
npm run build
↓
Install/update package in consuming app
↓
npx cap sync
↓
Build/run consuming app

---

## Android permissions

The plugin declares and requests the permissions required by the Android
version:

- Android 13 and later: `NEARBY_WIFI_DEVICES`, `BLUETOOTH_SCAN`,
  `BLUETOOTH_CONNECT`, and `BLUETOOTH_ADVERTISE`
- Android 12: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and
  `BLUETOOTH_ADVERTISE`
- Android 11 and earlier: `ACCESS_FINE_LOCATION`
- All supported Android versions: `ACCESS_WIFI_STATE` and
  `CHANGE_WIFI_STATE` (normal manifest permissions used by Nearby Connections)

If the user denies these permissions, plugin calls reject with an error and
discovery or hosting cannot start. The user can grant them again from the
application's system settings.

---

## Basic usage

Import the plugin from the package:

```ts
import { NearbyGame } from 'tholos-nearbygame';
```

Use the same `serviceId` for the host and every client that should discover
it. The `serviceId` is an application-defined identifier; for example, use a
game-specific value rather than a value that changes for every device.

### Host a game

```ts
await NearbyGame.addListener('connectionChanged', (event) => {
  if (event.state === 'requested') {
    // Ask the player whether to accept this peer.
    void NearbyGame.acceptConnection({
      endpointId: event.endpointId,
      accept: true,
    });
  }

  if (event.state === 'connected') {
    console.log(`Connected to ${event.name ?? event.endpointId}`);
  }

  if (event.state === 'disconnected') {
    console.log(`Disconnected from ${event.endpointId}`);
  }
});

await NearbyGame.startHosting({
  serviceId: 'com.example.game.session',
  displayName: 'Player One',
});
```

### Discover and connect to a host

```ts
const peerFound = await NearbyGame.addListener('peerFound', (peer) => {
  console.log(`Found ${peer.name}`);

  void NearbyGame.requestConnection({
    endpointId: peer.endpointId,
    displayName: 'Player Two',
  });
});

await NearbyGame.addListener('connectionChanged', (event) => {
  if (event.state === 'connected') {
    void NearbyGame.sendMessage({
      endpointId: event.endpointId,
      message: JSON.stringify({ type: 'game-ready' }),
    });
  }
});

await NearbyGame.startDiscovering({
  serviceId: 'com.example.game.session',
});
```

Register listeners before starting hosting or discovery so that early events
are not missed. A connection request is reported to the host through
`connectionChanged` with `state: 'requested'`; the host must call
`acceptConnection` with `accept: true` or `false`.

## Session coordination

For games that need a shared roster and host-authoritative state updates, use
the optional `NearbyGameSession<TMember, TState>` exported by the package.
It manages transport listeners, player registration, snapshots, start-game
messages, state-update messages, and cleanup. The application supplies its
own member/state types and rules:

- `validateMember` validates a joining or updated member against the current
  roster.
- `parseState` validates state received over the connection.
- `addMember`, `updateMember`, and `removeMember` keep game state in sync with
  roster changes.
- `applyStateUpdate` decides whether a member's proposed state change is
  allowed. Return `null` to reject it; the host's current state is sent back.

Subscribe to snapshots for UI updates, then call `host(member, initialState)`
on the host or `discover(member)` followed by `connect(endpointId)` on a guest.
After players connect, the host can call `startGame()`. Use `updateProfile()`
and `updateState()` for later changes, and `stop()` when the session ends.
The snapshot includes the role, connection status, discovered peers, roster,
state, local member, game-started flag, and any error.

This coordinator is in-memory and peer-to-peer; it does not provide accounts,
persistent storage, matchmaking, or a remote server. Game-specific rules
(such as player limits, unique colors, and allowed score changes) remain the
application's responsibility.

## Sending and receiving messages

Messages are UTF-8 strings. Serialize structured game data before sending and
parse it when receiving:

```ts
const messageReceived = await NearbyGame.addListener('messageReceived', ({ endpointId, message }) => {
  const data = JSON.parse(message) as { type: string };
  console.log('Message from', endpointId, data.type);
});

await NearbyGame.sendMessage({
  endpointId: 'endpoint-id-from-peerFound',
  message: JSON.stringify({
    type: 'level-completed',
    level: 3,
  }),
});
```

## Events

| Event               | Payload                        | Description                                                       |
| ------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `peerFound`         | `{ endpointId, name }`         | A discoverable host was found.                                    |
| `peerLost`          | `{ endpointId }`               | A previously discovered host is no longer available.              |
| `connectionChanged` | `{ endpointId, state, name? }` | A connection was requested, connected, rejected, or disconnected. |
| `messageReceived`   | `{ endpointId, message }`      | A UTF-8 text message was received.                                |

Possible `connectionChanged.state` values are `requested`, `connected`,
`rejected`, and `disconnected`.

## Stopping and cleaning up

Stop only the operation used by the current role. A host should stop hosting;
a client should stop discovering. Pass an endpoint ID to disconnect one peer,
or omit it to disconnect all peers:

```ts
await NearbyGame.stopHosting();
await NearbyGame.stopDiscovering();

await NearbyGame.disconnect({ endpointId: 'endpoint-id' });
// await NearbyGame.disconnect(); // disconnect every peer
```

Remove listeners when the screen or component is destroyed:

```ts
const listener = await NearbyGame.addListener('peerFound', (peer) => {
  console.log(peer);
});

await listener.remove();
```

The native Android implementation also stops advertising, discovery, and all
connections when the plugin is destroyed.

## API reference

The public API is available from the `NearbyGame` export and the exported
TypeScript types:

- `startHosting({ serviceId, displayName })`
- `stopHosting()`
- `startDiscovering({ serviceId })`
- `stopDiscovering()`
- `requestConnection({ endpointId, displayName })`
- `acceptConnection({ endpointId, accept })`
- `sendMessage({ endpointId, message })`
- `disconnect({ endpointId? })`
- `addListener(eventName, listener)`

## Troubleshooting

- **No peers are found:** verify both devices use the exact same `serviceId`,
  Bluetooth is enabled, permissions are granted, and the host has called
  `startHosting`.
- **A connection is rejected:** the host must handle the `requested` event and
  call `acceptConnection`.
- **The API is unimplemented:** run the app on Android. Web and iOS support
  for Nearby operations is not available in the current package version.
- **Changes do not appear after installation:** run `npx cap sync`, then clean
  and rebuild the native application.
