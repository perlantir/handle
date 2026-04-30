# Handle — Designer Handoff Package

This folder is everything a designer (or design engineer) needs to take **Handle** into Figma, build a component library, and ship the production UI.

## What's inside

| File | Purpose |
|------|---------|
| `tokens.json` | Design tokens (W3C-style) — color, type, spacing, radii, shadows, motion. Ingest into Figma via *Tokens Studio* or your tool of choice. |
| `tokens.css` | Same tokens as CSS custom properties — drop into any web codebase. |
| `figma-spec.md` | Figma frame conventions, recommended style/variant names, layout grids, naming. |
| `component-specs.md` | Per-component spec: dimensions, padding, radius, states, behavior, animation. |
| `screen-specs.md` | Per-screen anatomy: sidebar / topbar / content composition for all 11 screens. |
| `icons.jsx` | Source for the 30+ inline SVG icons used in the design (24×24 base, 1.6 stroke). |
| `refs/` | React component source for every screen (read-only reference — copy patterns, not build targets). |

## How to use

1. **Set up Figma styles** from `figma-spec.md` + `tokens.json`. Create paint styles, text styles, and effect styles before building components.
2. **Build the atomic components** listed in `component-specs.md` (Pill Button, Status Dot, Plan Step, Mode Pill, Continue Card, Composer, Sidebar Nav Item, Toggle, Status Bar, Inspector blocks, Approval Modal, Provider Card, etc.).
3. **Compose screens** following `screen-specs.md`. The 11 screens cover Home, Tasks list, Live Workspace (3-pane), Approval modal, Wide Research, Memory graph, Skills, Schedules, Onboarding, Integrations, Settings.
4. **Cross-reference visuals** by opening `Handle - Full Design.html` (root of project) — every screen is rendered side-by-side as a design canvas.

## Visual hierarchy at a glance

- **Surface palette** — warm bone canvas (`#FAFAF7`), white surfaces, near-black text (`#1A1B1F`). No pure black, no pure white-on-white.
- **Accent** — single vivid blue (`#3D7CF1`) for agent identity / running state. Status dots: green (success), amber (waiting/approval), red (error).
- **Type** — SF Pro Display for headings, SF Pro Text for body, SF Mono for tool calls. Weight is the primary hierarchy lever, not size.
- **Density** — generous on Home (hero feel), tight on Workspace (operator feel). Same tokens, different rhythm.
- **Motion** — subtle: status-dot pulse (1.6 s), shimmer on "running" tags, knob-slide toggles (180 ms). No bouncy easings.

## Naming conventions

- **Components:** `Component / Variant / State` — e.g. `Pill Button / Primary / Default`, `Pill Button / Primary / Hover`.
- **Tokens:** `category/subcategory` — e.g. `text/secondary`, `bg/surface`, `radius/lg`.
- **Screens:** Two-digit prefix + descriptive name — e.g. `01 Home`, `03 Workspace`, `04 Approval Modal`.

## Outstanding decisions for the team

- **Empty states** are not yet specced (Tasks with 0 items, Memory with no entities, etc.).
- **Mobile / responsive** is out of scope — these are desktop frames only.
- **Dark mode** is implied by token structure but not designed.
- **Brand wordmark** uses a placeholder glyph + "Handle" wordmark — final logo TBD.

— Handed off from the Handle design exploration (Claude × kiwi).
