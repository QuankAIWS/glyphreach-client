# GlyphReach Client Agent Instructions

This repository is the **public browser/client surface** for GlyphReach. Treat public visibility as an architectural constraint.

## Before doing cross-repository work

If you have access to the private `QuankAIWS/glyphreach-backend` repository, read `docs/HANDOFF.md` there before making product, protocol, architecture, or deployment decisions. That private handoff is the canonical cross-repository state record.

Do not independently invent a browser/backend protocol when another agent is working on the backend. Establish or update a versioned browser-safe contract and coordinate both sides explicitly.

## Authority boundary

The client may render, animate, collect input, predict/interpolate presentation, and request actions. It must not become authoritative for game state.

Do not place the following in this repository unless they are inherently required by the shipped browser client:

- authoritative progression or XP formulas;
- authoritative combat, loot, economy, crafting, or quest resolution;
- hidden quest branches, unreleased regions, secrets, or server-only content;
- anti-cheat detection logic that would be weakened by disclosure;
- AI system prompts, private context assembly, curator logic, or model credentials;
- production secrets, database credentials, tunnel credentials, signing material, or administrative endpoints;
- private deployment authority;
- backend implementation details that are not required by the protocol.

When a feature can be implemented either client-side or server-side, prefer server authority unless responsiveness strictly requires a browser prediction/presentation layer.

## Product/runtime boundary

GlyphReach is independent from GameFrame. Do not add GameFrame as a runtime dependency or embed GlyphReach inside GameFrame. GameFrame may later navigate/link to GlyphReach as a launcher surface.

The intended renderer is PixiJS. The first client milestone is intentionally plain: connect to the authoritative backend, render one bounded world, show local/remote players, and prove multiplayer movement/persistence before broad visual/world expansion.

## CI and artifacts

- Use GitHub-hosted runners (`ubuntu-latest`) for this public repository.
- Public visual/browser review may generate short-lived screenshot and test artifacts.
- Workflows must use least-privilege permissions and must not expose private backend secrets to pull-request code.
- Do not add the private self-hosted runner to this repository.
- Preserve full-SHA action pinning and the repository's selected-action policy.
- Do not use `pull_request_target` unless the owner explicitly approves a reviewed security design for it.

## Testing

Browser tests should prove real player-facing behavior. Mocked tests are useful for UI contracts but must not become the only evidence for important client/backend journeys.

At major milestones, add a real integrated journey against a test/staging backend for authentication/test identity, world entry, movement, reconnect, and later gameplay systems.

Visual/UI development belongs in this public repo so GitHub-hosted runners can generate short-lived Playwright screenshots without consuming the trusted private runner.

## Contributions and ownership

This is proprietary, publicly viewable software. Do not add an open-source license. Preserve `LICENSE`, `NOTICE`, and the ownership language in `README.md`.

Do not accept unsolicited third-party code or creative content without explicit owner direction and appropriate written IP terms.

## Product direction

The first milestone is a tiny complete persistent online RPG loop, not a broad engine rewrite: shared world, movement, persistence, gathering, crafting, combat, NPC/dialogue, a tutorial quest, disconnect/recovery, and multiplayer observation.

AFK progression is a first-class future gameplay requirement, but the first rendering/client work should stay focused on the smallest complete multiplayer slice rather than implementing many disconnected feature stubs.
