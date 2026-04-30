# Handle — Component Specs

## Pill Button
- Height: 34 (default) / 38 (large) / 30 (small)
- Padding: 0 14 (default) / 0 18 (large) / 0 12 (small)
- Radius: height ÷ 2 (e.g. 17, 19, 15)
- Gap (icon + label): 7
- Variants:
  - **Primary (dark):** bg `#15171A`, color `#FFF`, no border
  - **Secondary:** bg `bg/surface`, color `text/primary`, 1px `border/subtle`
  - **Ghost:** transparent, color `text/secondary`, no border
- Icon size: 12–13
- Font: 12.5 / 13 SF Pro Text, weight 500, letter-spacing −0.005em

## Sidebar Nav Item
- Height: 34, margin 0 10, padding 0 14, radius 10
- Default: color `text/secondary`, weight 400, transparent
- Active: color `text/primary`, weight 500, bg `rgba(20,22,26,0.05)`
- Icon: 16, color `text/tertiary` (default) / `text/primary` (active)
- Optional trailing badge: 11 px tabular-nums in `text/muted`

## Sidebar Section Label
- Padding 0 24 8, font 11 / 14, weight 500, letter-spacing 0.02em, color `text/muted`

## Composer (centered)
- Container: bg `bg/surface`, 1px `border/subtle`, radius 18, padding 20 22 14
- Placeholder: 15 / 22, color `text/tertiary`
- Action row: 32-px chips with 16 radius, send button 36 round in primary

## Mode Pill (composer mode chips)
- Height 34, padding 0 14, radius 17, gap 7
- Inactive: 1px `border/subtle`, color `text/secondary`
- Active: 1px `text/primary` border, color `text/primary`

## Continue Card
- Padding 18 20, radius 14, bg `bg/surface`, 1px `border/subtle`
- Status row: 7-px dot + status label (caption) + tag (right)
- Title: 13.5 / 1.4 weight 500
- Meta: 11.5 `text/tertiary`

## Status Dot
- 7 px circle, optional 4-px halo at color/0.15 for "running" pulse
- Animation: `hd-pulse` 1.6 s infinite (opacity 1 → 0.5)

## Plan Step
- Done: 14 px filled circle in `status/success` with white check
- Active: 14 px filled circle in `accent`, halo 4 px at 0.18
- Pending: 14 px outline circle, 1.5 px `border/default`
- Connector: 1 px vertical line in `border/subtle`, between dot centers

## Approval Pill (orange)
- Height 22, padding 0 9, radius 11
- Bg `oklch(0.78 0.16 80 / 0.16)`, color `oklch(0.50 0.16 80)`
- Font 11 / 14, weight 500
- Optional shield icon, 11 px

## Status Bar (Workspace top)
- Height 56, marginTop 32 (clear traffic lights), padding 0 24 0 32
- Pulsing dot · 8 px (with 16 px halo)
- Title block: 13.5 weight 500 / 11 secondary line
- Right cluster: model · runtime · cost (vertically stacked label + value, 1 px separators 22 high), approval pill, pause/stop icon buttons

## Inspector Block
- Section label 11 uppercase 0.04em, badge optional
- Tool call card: header bar (10 12 padding, dot + monospace function name + "running" shimmer), body `<pre>` 11 px monospace
- Approval row: card with shield icon + "Review" pill button
- Memory used / Files touched / Sources rows: 22 px square avatar + 12-px label + 10.5-px subtext

## Bottom Composer (Workspace)
- Border-top `border/subtle`, padding 14 24
- Inner pill: bg `bg/canvas`, 1px `border/subtle`, radius 14
- Send button 34 round in primary

## Modal (Approval)
- Width 540, radius 18
- Shadow: `shadow/modal`
- Backdrop: `rgba(20,22,26,0.30)`
- Padding: 28 32 (header), 20 32 (sections), 20 32 (actions, with top border)

## Provider / Integration / Skill Card
- Padding 20, radius 14, bg `bg/surface`, 1px `border/subtle`
- Avatar: 36 × 36 (provider) / 38 × 38 (skill, integration), radius 10
- Letter avatar: white text, 16–17 weight 600
- Trailing more-button: ghost, 14-px icon

## Toggle
- 32 × 18 track, 14 × 14 knob, 9 px radius
- Off: bg `bg/muted`, knob `bg/surface`
- On: bg `accent`, knob `bg/surface`
- Animation: knob left 2 → 16, 180 ms

## Progress Bar
- Height 4 (or 2 in dense), radius 2, bg `bg/muted`
- Fill: `accent` (or success green when 100%)

## Toast / Banner (Approval needed)
- Background `oklch(0.78 0.16 80 / 0.06)`, 1px `oklch(0.78 0.16 80 / 0.20)`, radius 10
- Padding 10 12, gap 10
