# GlyphReach Client

GlyphReach Client is the public browser client for **GlyphReach**, a persistent online fantasy RPG.

This repository is intentionally limited to player-facing presentation and browser-safe code. The authoritative game runtime is maintained separately in the private `QuankAIWS/glyphreach-backend` repository.

## Current executable foundation

**Milestone 0: Connected World is implemented.**

The client currently provides:

- TypeScript + Vite browser application;
- PixiJS world renderer;
- browser-safe protocol v1 definitions/parsing;
- native browser WebSocket connection;
- `HELLO` handshake carrying protocol version and client build identifier;
- handling of authoritative `WELCOME` snapshots and explicit server rejection;
- rendering of server-provided world bounds and temporary player position;
- connection/world/player/client-build/server-build status UI;
- protocol unit tests;
- Playwright browser smoke coverage and screenshot generation;
- GitHub-hosted `ubuntu-latest` CI.

The browser does not decide authoritative player position or other persistent/economic outcomes. The backend sends the snapshot; Pixi renders it.

The next milestone is shared server-authoritative presence and movement for three concurrent clients.

## Local development

Install dependencies and run the client:

```bash
npm install
npm run typecheck
npm run test:unit
npm run build
npm run dev
```

By default the browser expects the development backend at:

```text
ws://127.0.0.1:8787/world
```

Override it with `VITE_GLYPHREACH_WS_URL` when needed. `VITE_GLYPHREACH_BUILD_SHA` may be supplied during builds so the client advertises an exact revision in the handshake.

For browser verification:

```bash
npm run build
npm run test:e2e
```

Playwright starts a **test-only protocol stub** and the built client, verifies the connected Pixi surface, and writes a screenshot under `test-results/`. The stub exists only for public-client testing; it is not game authority or production backend code.

## Repository boundary

This repository may contain:

- browser rendering and presentation;
- PixiJS/client integration;
- input and accessibility code;
- animation and audio playback;
- browser-safe assets;
- public network protocol shapes;
- client-side prediction/interpolation that cannot create authoritative state;
- browser, visual, and screenshot tests;
- public CI and development tooling.

This repository must **not** contain:

- authoritative game rules or state transitions;
- server-side progression, combat, economy, loot, crafting, or quest authority;
- unreleased or hidden world content;
- private AI prompts, context assembly, curation logic, or model credentials;
- production secrets, tunnel credentials, database credentials, or deployment authority;
- private infrastructure topology or administrative tooling;
- proprietary backend design documents that are not required by the browser client.

The browser may request an action. The backend decides whether the action is legal and what state change, if any, occurs.

## CI policy

Public client CI uses **GitHub-hosted runners**. Do not add this repository to the private self-hosted runner group.

The current restricted Actions allowlist permits the green build/test path but still blocks the additional pinned Actions desired for explicit Node setup and artifact upload. Therefore the browser screenshot is currently generated during CI but not retained as an uploaded Actions artifact. The private backend `docs/STATUS.md` records the exact manual allowlist change required before those actions are reintroduced.

## License and ownership

**This is publicly viewable proprietary software, not an open-source project.**

Copyright © 2026 QuankAIWS. All rights reserved.

No license to use, modify, distribute, host, sell, sublicense, or create derivative works is granted except for rights that necessarily arise from GitHub's Terms of Service or applicable law, or by separate written permission from the copyright owner. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
