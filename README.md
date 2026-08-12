# GlyphReach Client

GlyphReach Client is the public browser client for **GlyphReach**, a persistent online fantasy RPG.

This repository is intentionally limited to player-facing presentation and browser-safe code. The authoritative game runtime is maintained separately in the private `QuankAIWS/glyphreach-backend` repository.

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

Public client CI uses **GitHub-hosted runners**. Long-running browser and visual-review jobs belong here so screenshot and test artifacts can use the public-repository Actions lane without consuming the private self-hosted runner.

## Development status

Early foundation work. The first product target is a tiny but complete persistent multiplayer RPG loop: authenticate, enter a shared world, move, gather, craft, fight, quest, persist, disconnect, and recover.

## License and ownership

**This is publicly viewable proprietary software, not an open-source project.**

Copyright © 2026 QuankAIWS. All rights reserved.

No license to use, modify, distribute, host, sell, sublicense, or create derivative works is granted except for rights that necessarily arise from GitHub's Terms of Service or applicable law, or by separate written permission from the copyright owner. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
