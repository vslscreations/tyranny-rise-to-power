# Cyberpunk Skill Tree & Progression Nodes System

**Version 1.0 - a modular, pure-vector skill tree and perk node interface kit for
cyberpunk games.**

A complete progression screen system built from clean vector geometry: three master
sheets, fourteen isolated components, and transparent PNG exports at 2x and 4x. The
pack covers the full loop - four branch trees, three node tiers plus keystone
capstones, four node states, circuit traces, rank pips, radial progress rings, skill
inspection, hold-to-unlock, point counters, and respec confirmation.

All lettering is converted to vector outlines. No fonts are required to open, render
or ship these files.

---

## Package contents

```
svg/
  skill_tree_network.svg                  1200 x 700
  perk_nodes_connectors.svg               1200 x 700
  skill_inspection_unlock_ui.svg          1200 x 600
  components/
    01_branch_header_badges.svg            292 x 232
    02_skill_node_states.svg               573 x 149
    03_circuit_connector_lattice.svg       458 x 188
    04_tier_divider_rails.svg              540 x 148
    05_minor_hex_stat_node.svg             272 x 176
    06_major_oct_ability_node.svg          345 x 196
    07_ultimate_diamond_keystone.svg       363 x 217
    08_rank_pips_progress_rings.svg        537 x 202
    09_modular_circuit_segments.svg        469 x 255
    10_node_socket_bases.svg               441 x 168
    11_skill_inspection_card.svg           420 x 500
    12_hold_to_unlock_button.svg           320 x 122
    13_skill_points_counter.svg            342 x 192
    14_reset_respec_modal.svg              420 x 430
png_2x/
  skill_tree_network.png                 2400 x 1400
  perk_nodes_connectors.png              2400 x 1400
  skill_inspection_unlock_ui.png         2400 x 1200
png_4x/
  skill_tree_network.png                 4800 x 2800
  perk_nodes_connectors.png              4800 x 2800
  skill_inspection_unlock_ui.png         4800 x 2400
png_components_2x/
  01_branch_header_badges.png             584 x 464
  02_skill_node_states.png               1146 x 298
  03_circuit_connector_lattice.png        916 x 376
  04_tier_divider_rails.png              1080 x 296
  05_minor_hex_stat_node.png              544 x 352
  06_major_oct_ability_node.png           690 x 392
  07_ultimate_diamond_keystone.png        726 x 434
  08_rank_pips_progress_rings.png        1074 x 404
  09_modular_circuit_segments.png         938 x 510
  10_node_socket_bases.png                882 x 336
  11_skill_inspection_card.png            840 x 1000
  12_hold_to_unlock_button.png            640 x 244
  13_skill_points_counter.png             684 x 384
  14_reset_respec_modal.png               840 x 860
README.md
LICENSE.txt
```

**39 files in the download.** The component PNG dimensions are exactly twice the
component viewBox.

---

## The three master sheets

### 1. Skill Tree Network - 1200 x 700

A complete four-branch progression tree:

- Four branch headers: NETRUNNING, COMBAT, CHROME / BODY, and STEALTH, each with an
  icon plate and a points-spent count.
- Three attribute tiers plus a keystone row: TIER I (entry), TIER II (specialized),
  TIER III (elite), and KEYSTONE capstones.
- Twenty nodes across four branches: hex stat nodes, octagon ability nodes, and
  diamond keystone capstones.
- Four node states in one screen: locked, available, active, and mastered.
- Orthogonal circuit traces with 45-degree chamfers, diamond lattices, relay dots,
  cross-branch bridges, and a bypass route.

### 2. Perk Nodes & Connectors - 1200 x 700

A component library sheet for the node system:

- Minor hex stat node: empty hex socket and an active rank-2 stat node.
- Major octagon ability node: empty octagon socket and an active rank-2 ability node.
- Ultimate diamond keystone: base socket and a mastered capstone with burst.
- Rank pip rails and radial progress rings: 0/3 EMPTY, 1/3 STARTED, 3/3 MAX.
- Modular circuit segments: straight bus, 45-degree corner, T-junction, and
  cross-hub junction, with port diamonds and terminal relays.

### 3. Skill Inspection & Unlock UI - 1200 x 600

The interaction layer that sits beside the tree:

- Skill inspection card with header, school tag, rank, stat bars, prerequisites,
  effect block, cost row, and a warning chip.
- Hold-to-unlock button with a 20-segment charge bar, key prompt, and release/cancel
  guidance.
- Skill points counter with separate SP and AP readouts, pip rails, and spend totals.
- Reset / respec modal with a destructive confirmation, point refund summary, and
  cancel/confirm controls.

---

## Isolated components

| # | File | Size | Contents |
|---|------|------|----------|
| 01 | `01_branch_header_badges.svg` | 292 x 232 | Four branch header plates with icons and counts |
| 02 | `02_skill_node_states.svg` | 573 x 149 | Locked, available, active, mastered hex nodes side by side |
| 03 | `03_circuit_connector_lattice.svg` | 458 x 188 | Routed traces, relays, junctions and a cross hub |
| 04 | `04_tier_divider_rails.svg` | 540 x 148 | Tier I / II / III and keystone divider rails |
| 05 | `05_minor_hex_stat_node.svg` | 272 x 176 | Hex socket plus an active rank-2 stat node |
| 06 | `06_major_oct_ability_node.svg` | 345 x 196 | Octagon socket plus an active rank-2 ability node |
| 07 | `07_ultimate_diamond_keystone.svg` | 363 x 217 | Keystone base plus a mastered capstone |
| 08 | `08_rank_pips_progress_rings.svg` | 537 x 202 | Pip rails and radial rings at 0, 1 and 3 of 3 |
| 09 | `09_modular_circuit_segments.svg` | 469 x 255 | Straight, corner, T-junction and cross-hub traces |
| 10 | `10_node_socket_bases.svg` | 441 x 168 | Empty hex, octagon and keystone sockets |
| 11 | `11_skill_inspection_card.svg` | 420 x 500 | Full inspection card with stats and cost |
| 12 | `12_hold_to_unlock_button.svg` | 320 x 122 | Segmented 20-cell charge button |
| 13 | `13_skill_points_counter.svg` | 342 x 192 | SP and AP counters with pip rails |
| 14 | `14_reset_respec_modal.svg` | 420 x 430 | Respec confirmation dialog |

Every component is tightly cropped to its rendered artwork, so there is no empty
canvas around the design. The crop origin is preserved in the viewBox (for example
`74 32` for the connector lattice), which keeps the artwork aligned to the master
sheet coordinates while the canvas stays minimal. Component PNGs are rendered at
exactly 2x the viewBox.

---

## Technical specification

- **100% vector.** Every file contains only SVG vector primitives and paint
  definitions: `<svg>`, `<title>`, `<desc>`, `<defs>`, `<g>`, `<path>`, `<line>`,
  `<circle>`, `<rect>`, `<polygon>`, `<linearGradient>`, `<radialGradient>`,
  `<stop>` and `<pattern>`. There are no raster elements, filters, masks or
  clipping paths.
- **No text elements.** All lettering is converted to outlined paths, so no fonts,
  font stacks or `font-family` attributes are present. Each outlined label keeps a
  `data-text` attribute for searchability and QA.
- **No external dependencies.** No `<image>`, no `<use>`, no base64 rasters, no
  external `href`, no scripts and no web fonts.
- **Transparent exports.** Master and component PNGs are RGBA with an alpha
  channel; panels and frames are dark, the page background is transparent.
- **Hard-edged geometry.** Beveled frames, corner ticks, hairline insets, circuit
  motifs and scanline fills; no raster effects or blurs.
- **Editable palette.** Colors are literal hex values (plus a small set of
  gradients and patterns) so a palette swap is a simple find-and-replace.
- **Separated structure and content.** Node frames are grouped apart from sample
  icons and labels, so sample content can be removed without touching the frame.

### Group IDs

| Sheet | Structural groups | Sample content groups |
|---|---|---|
| 01 Skill Tree | `branch-badge`, `tier-divider`, `node-frame` | `node-sample-content` |
| 02 Node Library | `node-frame`, `rank-progress-set`, `circuit-segment-set` | `node-sample-content` |
| 03 Inspection UI | `inspection-card-frame`, `hold-button-frame`, `points-counter-frame`, `respec-modal-frame` | `inspection-card-sample-content`, `hold-button-sample-content`, `points-counter-sample-content`, `respec-modal-sample-content` |

Every node in the kit uses the same local pair: `node-frame` for the socket, ring,
ports and state treatment, and `node-sample-content` for the icon, label and rank
pips. Composite widgets in sheet 03 follow the same pattern (`<widget>-frame` and
`<widget>-sample-content`).

### Palette

| Colour | Hex | Use |
|---|---|---|
| Neon Cyan | `#00F0FF` | primary frames, focus, active states |
| Electric Yellow | `#FCEE0A` | available nodes, charges, highlights |
| Neon Magenta | `#FF003C` | mastered keystones, warnings, destructive actions |
| Dark Slate | `#0A0E14` | lettering counters and deep detail cuts |
| Deep Void | `#05080C` | deepest panel gradient stop and sheet viewport |
| Panel Fill | `#0D141C` | panel and card fills |
| Hairline Slate | `#1B2733` | 1 px structural hairlines |
| Muted Slate | `#6E8498` | secondary labels and locked states |

The first five colors are the core palette. The neutrals are structural. Recolor the
cyan, yellow and magenta accents to reskin the entire pack.

---

## Using the pack

### SVG

Open the files directly in Figma, Illustrator, Affinity Designer, Inkscape or a game
engine with SVG support. Each component is a single flat group tree with no masks,
filters or clipping paths, so import is clean. The master sheets are composed
screens; the components are the same artwork in compact standalone frames.

### PNG

The `png_2x` and `png_4x` renders are intended for direct import into Unity, Godot,
Unreal, GameMaker or a web build. Use 2x for a 1200 x 700 design resolution and 4x
for high-DPI or print-scale needs. Component PNGs are 2x their viewBox and preserve
transparency.

### 9-slice / resizable frames

Panel corners use a 10-14 px bevel at 1x with a 1-2 px outer stroke and a 4 px inner
hairline. When slicing:

- keep the corner insets at 16-20 px for panels and 12-14 px for nodes;
- place the header stretch zone below the 42 px header band;
- leave the 4 px inner hairline in the fixed border, not the stretched center;
- hide the sample-content group before stretching a rail or a text block.

The node sockets, cards and buttons are already fixed-size and can be used without
slicing.

### Replacing sample content

Icons, labels, ranks and numbers are intentionally generic. To localize or rebrand,
hide the matching `*-sample-content` group and place your own text or icons in the
same cells. Because lettering is outlined, the sample labels cannot be edited as
text - they are vector shapes. The frames, sockets, traces and rails remain fully
editable.

### Theming

The pack shares its design language with the **Cyberpunk Modular HUD & Core Frames
System** and the **Cyberpunk Inventory & Equipment System** (sold separately): the
same bevel geometry, hairline weights, corner ticks, circuit language and palette.
The packs can be combined in one project without visual mismatch.

---

## File naming

- Master sheets: `skill_tree_network`, `perk_nodes_connectors`,
  `skill_inspection_unlock_ui`.
- Components: two-digit index + snake_case name, matching between `svg/components/`
  and `png_components_2x/`.
- PNG scale is carried by the folder (`png_2x`, `png_4x`), not the filename.

---

## License

Commercial use in games, apps and client projects is permitted. Reselling or
redistributing the files as an asset pack, UI kit or template is not. Attribution
is appreciated but not required.

Read `LICENSE.txt` for the full terms.

---

## Version

**1.0** - initial release: 3 master sheets, 14 components, 6 master PNG exports,
14 component PNG exports, pure-vector lettering.
