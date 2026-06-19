# pveSwitch

A minimalist React Native (Expo) app to power the **pveServer** on/off through
its Zigbee smart plug (Zigbee2MQTT), with at-a-glance reachability of the home
stack — all over Tailscale.

It speaks raw **MQTT 3.1.1 over TCP** straight to the broker (no backend),
keeping a live subscription so it always knows the plug's real state.

## Features

- **One power toggle** — reads the plug's actual `state` over MQTT and flips it
  (turns the server on if off, off if on).
- **Live energy** — the plug's `energy` value, shown small under the toggle.
- **Hierarchical reachability** — three TCP checks, top to bottom:
  1. **NAS** `100.108.70.1` — always on (the Tailscale gateway). If it's
     unreachable the app prompts you to turn on Tailscale.
  2. **pve** `100.111.213.5` — boots when the plug is on.
  3. **Ubuntu VM** `100.111.150.88` — runs on pve.

> Reachability uses a TCP connection test, not ICMP `ping` (which React
> Native/Expo can't send without extra native code). A refused connection still
> counts as "reachable". Ports are configurable in `src/config.ts`.

| | |
|---|---|
| Broker | `100.108.70.1:1883` |
| Command topic | `zigbee2mqtt/pveSwitch/set` → `{"state":"ON"\|"OFF"}` |
| State topic | `zigbee2mqtt/pveSwitch` → `{"state":..,"energy":..}` |

Everything tunable lives in [`src/config.ts`](src/config.ts).

## ⚠️ Needs a real build (not Expo Go)

Expo Go can't open raw TCP sockets, and `react-native-tcp-socket` is a native
module — so build a development build or a standalone APK.

### Cloud build with EAS (no Android SDK needed)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

EAS returns an installable **APK** (link + QR). Install it on a phone that's on
the same Tailscale network as the broker.

### Local build (needs Android Studio / SDK)

```bash
npx expo run:android
```

## Project layout

```
App.tsx                  UI: power toggle, energy, reachability board
src/config.ts            Broker, topics, hosts/ports — edit here
src/mqtt.ts              Persistent MQTT-over-TCP client
src/usePlug.ts           Hook: live state, energy, toggle()
src/ping.ts              TCP reachability check
src/useReachability.ts   Hook: polls the three hosts
```

## Notes

- **New Architecture is disabled** (`newArchEnabled: false`) because
  `react-native-tcp-socket` is a legacy native module — keeps builds predictable.
- The native `android/` and `ios/` folders are gitignored (Continuous Native
  Generation); they're regenerated on each build.
