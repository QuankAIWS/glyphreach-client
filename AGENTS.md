# GlyphReach Client Agent Instructions

This repository is the **public browser/client surface** for GlyphReach. Treat public visibility as an architectural constraint.

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

## CI and artifacts

- Use GitHub-hosted runners (`ubuntu-latest`) for this public repository.
- Public visual/browser review may generate short-lived screenshot and test artifacts.
- Workflows must use least-privilege permissions and must not expose private backend secrets to pull-request code.
- Do not add the private self-hosted runner to this repository.

## Contributions and ownership

This is proprietary, publicly viewable software. Do not add an open-source license. Preserve `LICENSE`, `NOTICE`, and the ownership language in `README.md`.

Do not accept unsolicited third-party code or creative content without explicit owner direction and appropriate written IP terms.

## Product direction

The first milestone is a tiny complete persistent online RPG loop, not a broad engine rewrite: shared world, movement, persistence, gathering, crafting, combat, NPC/dialogue, a tutorial quest, disconnect/recovery, and multiplayer observation.
