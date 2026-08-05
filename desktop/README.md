# Epic BOS — Desktop (Electron)

**Self-contained desktop app for Windows / macOS / Linux.** The backend server is bundled *inside*
the app — Electron boots it on launch, waits for it to be healthy, then loads the control UI from it.
No external server and no internet required. Your data is stored locally in the OS user-data folder.

## How it works (ADR-003)
- `main.js` spawns the Fastify server as a child process (`serverBin`/`serverArgs`):
  - **Dev:** `npx tsx ../server/src/index.ts`
  - **Prod:** `node resources/server/dist/index.js` (compiled server copied via `extraResources`)
- After `/api/health` returns 200, a `BrowserWindow` loads `http://127.0.0.1:3001/ui/`.
- All API calls go to the bundled server on `127.0.0.1` (not `0.0.0.0`) — no LAN exposure.
- On quit (or macOS hide-to-tray) the child server is terminated cleanly.
- Data lives in `app.getPath('userData')/epic.json` (outside the read-only `asar`).

## Run (dev)
```bash
cd ../server && npm install        # once
cd ../desktop && npm install        # once (installs electron + electron-builder)
npm start                           # boots server + opens the window
```
- `EPIC_DEVTOOLS=1 npm start` opens DevTools.
- `EPIC_DEBUG=1 npm start` streams server logs to the terminal.

## Build installers (per platform)
The server must be compiled first, then electron-builder packages it:
```bash
npm run dist:win      # -> desktop/dist/EpicBOS-<ver>-setup.exe (NSIS) + portable
npm run dist:mac      # -> desktop/dist/EpicBOS-<ver>.dmg + .zip
npm run dist:linux    # -> desktop/dist/EpicBOS-<ver>.AppImage + .deb + .tar.gz
```
or `npm run dist` to build for the **current** OS.

> **Windows code-sign quirk:** electron-builder downloads a `winCodeSign` cache that contains
> macOS `.dylib` symlinks. On some Windows accounts the extractor lacks symlink privilege and the
> build aborts with *"Cannot create symbolic link … privilege not held"*. Fixes:
> 1. Open **PowerShell as Administrator** and re-run `npm run dist:win`, **or**
> 2. Enable **Settings → Privacy & Security → For developers → Developer Mode** (grants non-admin
>    symlink creation), then build normally.
> This is an electron-builder/environment limitation, not an app bug. macOS/Linux builds are unaffected.

## Security posture
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (renderer never gets Node).
- Renderer reaches the backend only via the REST API on `127.0.0.1`.
- External links (WhatsApp, Razorpay, GSP portals) open in the OS browser, never a new Electron window.
- Single-instance lock; system tray with Show/Quit.
