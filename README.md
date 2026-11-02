# tholos-nearbygame

This capacitor plugin is responsible for hosting and managing a lightweight game session for sharing level and bonuses between user

## Install

To use npm

```bash
npm install tholos-nearbygame
````

To use yarn

```bash
yarn add tholos-nearbygame
```

Sync native files

```bash
npx cap sync
```

## Android Nearby Connections

The Android implementation uses a Kotlin `NearbyConnectionManager` for Google
Nearby Connections and keeps the Capacitor plugin class as the JavaScript
adapter. It supports hosting, discovery, connection requests, accept/reject,
text messages, disconnect, and lifecycle cleanup.

The host Android application must grant the merged Nearby runtime permissions
when the first operation starts:

- Android 12+: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and `BLUETOOTH_ADVERTISE`
- Android 11 and earlier: `ACCESS_FINE_LOCATION`

Use the same `serviceId` for the host and discovering clients. Discovery emits
`peerFound` and `peerLost`; connection lifecycle emits `connectionChanged`;
received UTF-8 text emits `messageReceived`.

## API

<docgen-index></docgen-index>

<docgen-api>
<!-- run docgen to generate docs from the source -->
<!-- More info: https://github.com/ionic-team/capacitor-docgen -->
</docgen-api>
