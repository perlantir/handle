# Handle — Figma-Ready Design Spec

## Frame conventions
- All screens: **1440 × 900** desktop frames
- Modal: **540 × auto** centered on dimmed surface
- Mac chrome: traffic lights at `top: 16, left: 20` (12 × 12 dots, 8 gap)
- Sidebar: **244 px** fixed; brand at `top: 52` to clear traffic lights

## Color styles to create
Import from `tokens.json`. Recommended Figma style names:
- `bg / canvas` → #FAFAF7
- `bg / surface` → #FFFFFF
- `text / primary` → #1A1B1F
- `text / secondary` → #5C5E66
- `text / tertiary` → #8A8C94
- `text / muted` → #A8AAB1
- `accent / blue` → oklch(0.62 0.18 250) ≈ #3D7CF1
- `status / running` (same as accent)
- `status / waiting` → oklch(0.78 0.16 80) ≈ #D9A23B
- `status / success` → oklch(0.65 0.16 145) ≈ #2FA567
- `status / error` → oklch(0.60 0.20 25) ≈ #D8473C
- `agent / browser` → oklch(0.60 0.14 200) ≈ #2E92B3
- `agent / memory` → oklch(0.60 0.15 320) ≈ #B25BB7
- `agent / tool` → oklch(0.55 0.10 285) ≈ #7C6BB0

## Text styles
- **Display / H1** — SF Pro Display 30 / 36, weight 500, letter-spacing −0.025em
- **Display / H2** — SF Pro Display 22 / 28, weight 500, letter-spacing −0.02em
- **Display / H3** — SF Pro Display 18 / 24, weight 500, letter-spacing −0.015em
- **Body / lg** — SF Pro Text 15 / 22, weight 400
- **Body / md** — SF Pro Text 14 / 20, weight 400
- **Body / sm** — SF Pro Text 13 / 18, weight 400
- **Label / sm** — SF Pro Text 12 / 16, weight 500, letter-spacing −0.005em
- **Caption** — SF Pro Text 11 / 14, weight 400, letter-spacing 0.005em
- **Section label** — SF Pro Text 11 / 14, weight 500, letter-spacing 0.04em, UPPERCASE
- **Code / sm** — SF Mono 11 / 16, tabular-nums

## Effect styles
- `shadow / xs`, `shadow / sm`, `shadow / md`, `shadow / lg`, `shadow / modal` — see tokens.json

## Component layout
- Auto-layout horizontal, gap 8 for chip rows; gap 12 for card grids
- Cards use 14 px corner radius, 1 px stroke at `border / subtle` (4% black)
- Pills: 17–18 px radius (height ÷ 2)

## Naming conventions in Figma
- `Sidebar / NavItem / Default | Active`
- `Button / Pill / Primary | Secondary | Ghost`
- `Card / Continue`, `Card / Skill`, `Card / Provider`, `Card / Integration`
- `Status / Dot / Running | Waiting | Success`
- `Status / Pill / Running | Waiting | Approval`

## Frames included in this package
1. Home
2. Tasks list
3. Live Workspace (3-pane + status + composer)
4. Approval modal
5. Wide Research
6. Memory graph
7. Skills
8. Schedules
9. Onboarding · Connect tools
10. Integrations
11. Settings · Profile

See `screen-specs.md` for per-screen anatomy and `component-specs.md` for component-level specs.
