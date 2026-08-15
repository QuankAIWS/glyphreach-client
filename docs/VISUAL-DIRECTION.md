# GlyphReach Visual Direction

Status: M10 presentation direction

## Product-facing goal

GlyphReach should read first as a persistent fantasy world and only second as a web application. The current prototype shell proved mechanics and authority, but its full-world diagram plus permanent developer control column is scaffolding, not the target product.

The visual direction is **field-survey fantasy**: an inhabited frontier observed through maps, worn materials, camp infrastructure, roads, river crossings, waystones, and old survey ruins. It should feel practical and exploratory rather than ornate-high-fantasy or generic dark-dashboard cyberpunk.

This is not a RuneScape UI clone. Reuse the useful interaction principles—world-dominant presentation, click-to-move, readable objects, compact persistent HUD, context-sensitive interactions, low-attention skilling—but give GlyphReach its own material and world identity.

## Screen hierarchy

Target hierarchy:

1. **World viewport** — dominant, ideally 80–95% of visible area.
2. **Immediate state** — health/combat, current activity, current objective, coins/inventory capacity.
3. **Context interaction** — nearby/selected NPC, resource, station, service, or hostile.
4. **Utility panels** — inventory, skills, journal, bank/shop, settings.
5. **Development diagnostics** — build pair, raw coordinates, world revision, exhaustive action buttons. These must be collapsible/hidden from the normal player shell.

Do not permanently reserve a large sidebar for every mechanic.

## World presentation

### Near-term

Keep the existing authoritative 1000x600 coordinate space and interaction contracts, but make the overview feel like a place rather than a graph:

- earthy terrain instead of a uniform dark rectangle;
- visible roads and paths connecting actual activity clusters;
- camp/settlement ground treatment around services and stations;
- river/fishing treatment around Northwatch;
- colder, desaturated stone treatment around Northreach;
- environmental props/silhouettes to break the empty plane;
- entity shadows/selection readability;
- labels used sparingly and contextually.

### Next structural step

Move from whole-world projection to a **camera-centered viewport**. The local character should occupy physical world space while the camera follows. The whole Reach should not be continuously visible at once. A separate minimap/map can provide orientation later.

Click-to-move remains the primary navigation path. Camera work must preserve authoritative world-coordinate conversion; the browser never owns final movement truth.

## Area identities

### Starter survey camp

- warm worn earth, canvas/wood, muted moss/grass;
- survey stakes, crates, forge/anvil shapes, copper scar;
- practical frontier-camp feel;
- readable amber forge/fire light.

### Northwatch

- cooler grass/river palette with warmer human occupation around campfire;
- visible river edge/pool and a stronger road/ford read;
- modest settlement/watch-post character rather than another cluster of symbols.

### Northreach Survey Vault

- colder slate/stone, reduced saturation, broken geometric ruin forms;
- restrained old-glyph/waystone accent light;
- should feel older and less safe than the settled areas before adding more mechanics.

## HUD direction

Normal player shell should eventually contain:

- top-left: compact GlyphReach/location treatment;
- top-right: connection/online indicator and later minimap/compass;
- bottom-left: current objective/activity message, not the full quest database;
- bottom-center or contextual near-selection: primary interaction choices;
- bottom-right: compact health/resources plus buttons/tabs for inventory, skills, journal, equipment;
- modal/drawer panels only when a player explicitly opens inventory, skills, bank, shop, journal, etc.

Combat state should become visually prominent when combat is relevant and recede when it is not.

## Interaction direction

The permanent prototype buttons are temporary.

Target behavior:

- click terrain -> move;
- click NPC -> select/interact/talk;
- click resource -> move/select, then choose Focused or Steady when in range;
- click station -> recipes appropriate to that station;
- click enemy -> select/attack with clear hostile feedback;
- click bank/merchant -> open focused bank/shop panel;
- inventory items -> equip/use from inventory instead of dedicated global buttons.

Do not expose actions globally when the corresponding world object is nowhere near the player.

## Art strategy

Do not block M10 on a giant asset pipeline. Establish composition and interaction using deliberate vector/procedural placeholder art first, then replace proven shapes with sprites/tiles/assets.

Prioritize in this order:

1. spatial composition and camera;
2. interaction readability;
3. area identity and lighting/materials;
4. character/NPC/enemy silhouettes;
5. production sprite/tile asset pass;
6. animation and effects polish.

Avoid spending large effort polishing UI or assets whose layout is still temporary.

## M10 presentation slices

### Slice A — world-first shell

- make the world dominate the viewport;
- add a compact live HUD;
- move exhaustive prototype controls into a collapsible development drawer;
- keep every existing mechanic/test hook functional;
- give the current overview meaningful terrain/roads/region staging.

### Slice B — contextual world interaction

- replace the most-used prototype buttons with selection/context actions;
- NPC dialogue, mining/fishing mode choice, combat targeting, stations;
- leave development drawer as fallback until coverage is complete.

### Slice C — local camera

- camera follows local player;
- world positions render at physical scale rather than whole-map normalization;
- update click conversion and browser tests to target authoritative coordinates under camera transforms;
- later add minimap/map orientation.

### Slice D — production art pass

Only after the layout and interaction loop survive real staging playtests.

## Review test

For every visual change ask:

> If the labels and developer buttons disappeared, would this still read as a coherent fantasy place with understandable things to do?

If the answer is no, improve the world/interaction language instead of adding another dashboard label.
