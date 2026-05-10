# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GTL Inspector is an offline-first PWA for daily field inspections in electrical/instrumentation operations at YPF Upstream's Vaca Muerta oil field (Argentina). Built with vanilla HTML/CSS/JS (zero npm dependencies), backed by Google Apps Script + Google Sheets as a serverless database.

## Development

**Dev server:** Uses the launch.json config — run `preview_start gtl-pwa-v2` to start the PowerShell HTTP server on port 8766. Alternatively: `python -m http.server 8080` or `npx serve -p 8080`.

**No build step, no linter, no test suite.** Edit files directly and refresh the browser. All changes must be manually verified in-browser.

**Backend:** `apps-script/Code.gs` is pasted into a Google Sheet's Apps Script editor. Run `setupSheets()` once to initialize. Deploy as a web app to get the `/exec` webhook URL.

## Architecture

**Frontend routing** is hash-based, managed by `js/app.js`. Views: `/home`, `/form`, `/dashboard`, `/more` → `/settings`, `/history`, `/parte/{id}`.

**Offline strategy:** Forms are queued in IndexedDB (`js/store.js`), drained to the Apps Script webhook when online (`js/sync.js`). The service worker (`sw.js`) uses cache-first for static assets and network-first for API calls. Background Sync API handles submissions when the app is closed.

**Data flow:** Inspector fills form → saved to IndexedDB queue → POST to Apps Script webhook → appended as row in Google Sheets (one sheet per obra/project). Dashboard reads back via GET.

**State management:** Each view (`js/views/*.js`) has a singleton `state` object. Config lives in localStorage, data in IndexedDB.

**Design system:** CSS custom properties in `css/tokens.css` follow YPF branding (blue #003087, yellow #FFD100). 4pt spacing grid, dark mode via `prefers-color-scheme` + manual toggle.

## Key Conventions

- All UI text is in Spanish.
- HTML escaping uses the `ESC()` helper in `app.js` for XSS prevention — always use it when inserting user data into HTML.
- Apps Script POST uses `Content-Type: text/plain` as a CORS workaround (not `application/json`).
- The "parte" (daily report) data structure has 5 sections: condiciones, hse, avances, handover, cierre. Avances columns are dynamic based on each obra's configured specialties (FO, PAT, PC, ELEC, INST, CIV, MEC).
- CDN dependencies: Chart.js 4.4.1, Google Fonts (Barlow, JetBrains Mono). These are cached by the service worker.
