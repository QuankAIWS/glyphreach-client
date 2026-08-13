# GlyphReach Client Agent Instructions

This repository is the **public browser/client surface** for GlyphReach. Treat public visibility as an architectural constraint.

## Before doing cross-repository work

If you have access to the private `QuankAIWS/glyphreach-backend` repository, read `docs/HANDOFF.md` and then `docs/STATUS.md` there before making product, protocol, architecture, or deployment decisions. The private handoff owns durable direction; status owns the current verified implementation and next task.

Do not independently invent a browser/backend protocol when another agent is working on the backend. Establish or update a versioned browser-safe contract and coordinate both sides explicitly.

## Authority boundary

The client may render, animate, collect input, predict/interpolate presentation, and request actions. It must not become authoritative for game state.

Do not place the following in this repository unless inherently required by the shipped browser client:

- authoritative progression or XP formulas;
- authoritative movement/path/collision results;
- authoritative combat, loot, economy, crafting, or quest resolution;
- hidden quest branches, unreleased regions, secrets, or server-only content;
- anti-cheat detection logic that would be weakened by disclosure;
- AI system prompts, private context assembly, curator logic, or model credentials;
- production secrets, database credentials, tunnel credentials, signing material, or administrative endpoints;
- private deployment authority;
- backend implementation details not required by the public protocol.

When a feature can be implemented either client-side or server-side, prefer server authority unless responsiveness strictly requires a browser prediction/presentation layer.

## Movement direction

**Click-to-move is a first-class and primary world-navigation interaction.** The browser may translate a click into a requested world target and show a target marker/presentation feedback, but the private runtime validates that request and owns path advancement/final position.

WASD/arrow movement may remain as an alternate control, development aid, or accessibility option. Do not make the client WASD-first and treat click movement as an afterthought.

Future obstacle avoidance/pathfinding must follow the server-authority contract even if the client adds presentation prediction.

## Product/runtime boundary

GlyphReach is independent from GameFrame. Do not add GameFrame as a runtime dependency or embed GlyphReach inside GameFrame. GameFrame may later navigate/link to GlyphReach as a launcher surface.

The renderer is PixiJS. Keep building small complete gameplay slices rather than a broad visual/world engine.

## CI and artifacts

- Use GitHub-hosted runners (`ubuntu-latest`) for this public repository.
- Public visual/browser review may generate short-lived screenshot and test artifacts.
- Workflows must use least-privilege permissions and must not expose private backend secrets to pull-request code.
- Do not add the private self-hosted runner to this repository.
- Preserve full-SHA action pinning and the repository's selected-action policy.
- This strict SHA policy is repository-specific; do not turn it into an organization-wide migration requirement.
- Do not use `pull_request_target` unless the owner explicitly approves a reviewed security design for it.

The current workflow intentionally stays green without `setup-node`/`upload-artifact` until those exact actions are manually allowed in this repository. Do not weaken policy or break CI merely to retain screenshot artifacts.

## Testing

Browser tests should prove real player-facing behavior. Mocked tests are useful for public protocol/UI contracts but must not become the only evidence for important client/backend journeys.

At major milestones, add a real integrated journey against a test/staging backend once deployment infrastructure exists. Cloudflare/domain setup is currently deliberately deferred; do not invent production URLs or secrets.

Visual/UI development belongs in this public repo so GitHub-hosted runners can perform Playwright work without consuming the trusted private runner.

## Product direction

The current foundation already includes multiplayer presence, authoritative movement/persistence, click-to-move, inventory projection, and the first Mining/AFK loop. Read private `docs/STATUS.md` before selecting the next task rather than reimplementing those milestones.

AFK progression is first-class. Active play should be more efficient without making lower-attention play useless.

## Contributions and ownership

This is proprietary, publicly viewable software. Do not add an open-source license. Preserve `LICENSE`, `NOTICE`, and the ownership language in `README.md`.

Do not accept unsolicited third-party code or creative content without explicit owner direction and appropriate written IP terms.
