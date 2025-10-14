# Zapieckanki Screen Rotation

A lightweight multi-screen product rotator. Control any number of browser windows (screens) from one controller page.

## Start

```bash
npm install
npm run dev
```

Controller: open http://localhost:5173/controller.html
Screen: open http://localhost:5173/screen.html?pos=0 (and increment `pos` per screen)

## Build

```bash
npm run build
```

```
npm run preview
```

## Pusher Setup

1. Utwórz aplikację w [Pusher Channels](https://dashboard.pusher.com/).
2. Skopiuj `App ID`, `Key`, `Secret`, `Cluster` do pliku `.env` na podstawie `.env.example`.
3. Uruchom serwer relay:
   ```bash
   npm run server
   ```
4. W kontrolerze i ekranach ustaw `PUSHER_KEY`, `PUSHER_CLUSTER`, `PUSHER_ENDPOINT` (domyślnie `http://localhost:3000/trigger`).

## Features

- BroadcastChannel-based sync for same-device screens
- Animations and configurable intervals
- Works with plain HTML for custom content
