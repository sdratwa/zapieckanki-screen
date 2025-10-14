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

## Features

- BroadcastChannel-based sync for same-device screens
- Animations and configurable intervals
- Works with plain HTML for custom content
