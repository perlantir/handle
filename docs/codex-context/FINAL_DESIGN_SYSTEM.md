# Handle — Design System (FINAL)

This document is the visual specification for Handle. It integrates
the design package created by designer Claude into the engineering
spec. Every screen, component, and interaction in Handle uses the
tokens, components, and patterns defined here.

The design package itself (tokens.json, tokens.css, reference JSX,
etc.) lives at:

- packages/design-tokens/ — tokens.json + tokens.css
- packages/design-refs/ — reference JSX implementations

This document tells Codex what to import from those packages and
how to use it.

==================================================
SOURCE: DESIGNER HANDOFF PACKAGE
==================================================

The design system was created in a separate Claude session as a
designer handoff. It contains:

- tokens.json — W3C-style design tokens (color, type, space,
  radius, shadow, motion)
- tokens.css — Same tokens as CSS custom properties
- 30+ inline SVG icons at 24×24, 1.6 stroke
- 11 screen reference implementations in React JSX
- component-specs.md — detailed component shape descriptions
- screen-specs.md — per-screen anatomy

When you see "the design package" in this document, it refers to
those files.

==================================================
VISUAL HIERARCHY AT A GLANCE
==================================================

Surface palette:
- Warm bone canvas (#FAFAF7) — primary background
- White surfaces (#FFFFFF) — cards, modals
- Near-black text (#1A1B1F) — body text
- No pure black, no pure white-on-white

Accent:
- Single vivid blue (oklch(0.62 0.18 250) — approximately #3D7CF1)
- Used for: agent identity, "running" state, primary actions
- Not used for: error states, decorative elements

Status colors:
- Green (oklch(0.65 0.16 145)) — success
- Amber (oklch(0.78 0.16 80)) — waiting / approval needed
- Red (oklch(0.60 0.20 25)) — error
- Gray (oklch(0.65 0.02 250)) — paused

Typography:
- SF Pro Display — headings, hero text
- SF Pro Text — body, UI text
- SF Mono — tool calls, code, terminal output
- Weight is the primary hierarchy lever, not size

Density:
- Generous on Home (hero feel, padding 88px+ around composer)
- Tight on Workspace (operator feel, compact rows)
- Same tokens, different rhythm

Motion:
- Subtle, not bouncy
- Status-dot pulse: 1.6s infinite (opacity 1 → 0.5)
- Shimmer on "running" tags
- Knob-slide on toggles: 180ms cubic-bezier(0.2, 0, 0, 1)
- No bouncy spring animations

==================================================
DESIGN TOKENS REFERENCE
==================================================

### Colors

```
# Background
bg/canvas         #FAFAF7
bg/surface        #FFFFFF
bg/subtle         #F4F3EE
bg/muted          #EDECE6
bg/inverse        #15171A

# Borders
border/subtle     rgba(20,22,26,0.06)
border/default    rgba(20,22,26,0.10)
border/strong     rgba(20,22,26,0.16)
border/focus      oklch(0.62 0.18 250)

# Text
text/primary      #1A1B1F
text/secondary    #5C5E66
text/tertiary     #8A8C94
text/muted        #A8AAB1
text/onAccent     #FFFFFF
text/link         oklch(0.55 0.18 250)

# Accent (interactive)
accent/default    oklch(0.62 0.18 250)
accent/hover      oklch(0.56 0.20 250)
accent/active     oklch(0.50 0.20 250)
accent/soft       oklch(0.95 0.04 250)

# Status
status/running    oklch(0.62 0.18 250)
status/waiting    oklch(0.78 0.16 80)
status/success    oklch(0.65 0.16 145)
status/error      oklch(0.60 0.20 25)
status/paused     oklch(0.65 0.02 250)

# Agent activity colors (for timeline event dots)
agent/thinking    oklch(0.62 0.18 250)
agent/tool        oklch(0.55 0.10 285)
agent/browser     oklch(0.60 0.14 200)
agent/terminal    oklch(0.55 0.12 145)
agent/memory      oklch(0.60 0.15 320)
```

### Typography

```
fontFamily/sans      -apple-system, 'SF Pro Text', 'Inter', system-ui
fontFamily/display   -apple-system, 'SF Pro Display', 'Inter', sans-serif
fontFamily/mono      ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo

fontSize/xs    11px
fontSize/sm    12px
fontSize/base  13px
fontSize/md    14px
fontSize/lg    16px
fontSize/xl    20px
fontSize/2xl   24px
fontSize/3xl   32px
fontSize/4xl   44px
```

### Spacing

```
space/0     0px
space/1     4px
space/2     8px
space/3     12px
space/4     16px
space/5     20px
space/6     24px
space/8     32px
space/10    40px
space/12    48px
space/16    64px
```

### Radii

```
radius/xs    4px
radius/sm    6px
radius/md    8px
radius/lg    10px
radius/xl    12px
radius/2xl   16px
radius/3xl   20px
radius/pill  9999px
```

### Shadows

```
shadow/xs     0 1px 2px rgba(20,22,26,0.04)
shadow/sm     0 1px 3px rgba(20,22,26,0.06), 0 1px 2px rgba(20,22,26,0.04)
shadow/md     0 4px 12px rgba(20,22,26,0.06), 0 2px 4px rgba(20,22,26,0.04)
shadow/lg     0 12px 32px rgba(20,22,26,0.08), 0 4px 8px rgba(20,22,26,0.04)
shadow/modal  0 24px 80px rgba(20,22,26,0.20), 0 8px 24px rgba(20,22,26,0.10)
```

### Motion

```
motion/fast    120ms
motion/base    180ms
motion/slow    260ms
motion/ease    cubic-bezier(0.2, 0, 0, 1)
```

==================================================
HOW TO USE TOKENS
==================================================

### In Tailwind config

apps/web/tailwind.config.ts:

```typescript
import type { Config } from 'tailwindcss';
import tokens from '@handle/design-tokens/tokens.json';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Map tokens.json color tree into Tailwind
        bg: {
          canvas: tokens.color.bg.canvas.value,
          surface: tokens.color.bg.surface.value,
          subtle: tokens.color.bg.subtle.value,
          muted: tokens.color.bg.muted.value,
          inverse: tokens.color.bg.inverse.value,
        },
        // ... and so on for border, text, accent, status, agent
      },
      fontFamily: {
        sans: tokens.typography.fontFamily.sans.value.split(','),
        display: tokens.typography.fontFamily.display.value.split(','),
        mono: tokens.typography.fontFamily.mono.value.split(','),
      },
      fontSize: {
        xs: tokens.typography.fontSize.xs.value,
        sm: tokens.typography.fontSize.sm.value,
        base: tokens.typography.fontSize.base.value,
        md: tokens.typography.fontSize.md.value,
        lg: tokens.typography.fontSize.lg.value,
        xl: tokens.typography.fontSize.xl.value,
        '2xl': tokens.typography.fontSize['2xl'].value,
        '3xl': tokens.typography.fontSize['3xl'].value,
        '4xl': tokens.typography.fontSize['4xl'].value,
      },
      borderRadius: {
        xs: tokens.radius.xs.value,
        sm: tokens.radius.sm.value,
        md: tokens.radius.md.value,
        lg: tokens.radius.lg.value,
        xl: tokens.radius.xl.value,
        '2xl': tokens.radius['2xl'].value,
        '3xl': tokens.radius['3xl'].value,
        pill: tokens.radius.pill.value,
      },
      boxShadow: {
        xs: tokens.shadow.xs.value,
        sm: tokens.shadow.sm.value,
        md: tokens.shadow.md.value,
        lg: tokens.shadow.lg.value,
        modal: tokens.shadow.modal.value,
      },
      transitionTimingFunction: {
        'handle-ease': tokens.motion.ease.value,
      },
      transitionDuration: {
        fast: tokens.motion.fast.value,
        base: tokens.motion.base.value,
        slow: tokens.motion.slow.value,
      },
    },
  },
  plugins: [],
};

export default config;
```

### In CSS

For tokens not naturally fitting Tailwind utilities, use the CSS
variables imported from tokens.css:

```tsx
<div style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>
```

### In motion

```tsx
<motion.div
  animate={{ opacity: [1, 0.5, 1] }}
  transition={{ duration: 1.6, repeat: Infinity }}
/>
```

Or in CSS keyframes (preferred for status-dot pulse):

```css
@keyframes hd-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-dot.running::after {
  animation: hd-pulse 1.6s infinite;
}
```

==================================================
COMPONENT LIBRARY
==================================================

The component library is under apps/web/components/design-system/.
Each component follows a strict shape from component-specs.md in
the design package.

The atomic components (must build first):

### PillButton

Sizes: small (30) / default (34) / large (38)
Padding: 0 12 / 0 14 / 0 18
Radius: height ÷ 2 (15 / 17 / 19)
Gap (icon + label): 7
Variants:
- primary (dark): bg `#15171A`, color `#FFF`, no border
- secondary: bg `bg/surface`, color `text/primary`, 1px `border/subtle`
- ghost: transparent, color `text/secondary`, no border
Icon size: 12-13
Font: 12.5/13 SF Pro Text, weight 500, letter-spacing -0.005em

```tsx
// apps/web/components/design-system/PillButton.tsx
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'default' | 'lg';
  icon?: React.ReactNode;
}

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  ({ variant = 'secondary', size = 'default', icon, className, children, ...props }, ref) => {
    const sizes = {
      sm: 'h-[30px] px-3 text-[12.5px]',
      default: 'h-[34px] px-3.5 text-[13px]',
      lg: 'h-[38px] px-[18px] text-[13px]',
    };
    const variants = {
      primary: 'bg-[#15171A] text-white hover:bg-[#1A1B1F]',
      secondary: 'bg-bg-surface text-text-primary border border-border-subtle hover:bg-bg-subtle',
      ghost: 'bg-transparent text-text-secondary hover:bg-bg-subtle',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center gap-[7px] rounded-pill font-medium tracking-tight transition-colors duration-fast',
          sizes[size],
          variants[variant],
          className,
        )}
        {...props}
      >
        {icon && <span className="text-[13px]">{icon}</span>}
        {children}
      </button>
    );
  },
);

PillButton.displayName = 'PillButton';
```

### StatusDot

7px circle, optional 4px halo at color/0.15 for "running" pulse.
Animation: hd-pulse 1.6s infinite.

```tsx
// apps/web/components/design-system/StatusDot.tsx
import { cn } from '@/lib/utils';

interface StatusDotProps {
  status: 'running' | 'waiting' | 'success' | 'error' | 'paused';
  pulsing?: boolean;
  size?: 'sm' | 'default' | 'lg';  // 5 / 7 / 8 px
}

export function StatusDot({ status, pulsing = false, size = 'default' }: StatusDotProps) {
  const sizes = { sm: 'w-[5px] h-[5px]', default: 'w-[7px] h-[7px]', lg: 'w-[8px] h-[8px]' };
  const colors = {
    running: 'bg-status-running',
    waiting: 'bg-status-waiting',
    success: 'bg-status-success',
    error: 'bg-status-error',
    paused: 'bg-status-paused',
  };
  return (
    <span className="relative inline-flex">
      <span className={cn('rounded-pill', sizes[size], colors[status])} />
      {pulsing && (
        <span
          className={cn(
            'absolute inset-0 rounded-pill animate-pulse-handle opacity-30',
            colors[status],
          )}
          style={{ transform: 'scale(2)' }}
        />
      )}
    </span>
  );
}
```

Add to globals.css:

```css
@keyframes pulse-handle {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.1; }
}
.animate-pulse-handle {
  animation: pulse-handle 1.6s infinite;
}
```

### PlanStep

Three states:
- Done: 14px filled circle in `status/success` with white check
- Active: 14px filled circle in `accent`, halo 4px at 0.18
- Pending: 14px outline circle, 1.5px `border/default`
Connector: 1px vertical line in `border/subtle`, between dot centers

### ApprovalPill (orange)

Height 22, padding 0 9, radius 11
Bg `oklch(0.78 0.16 80 / 0.16)`, color `oklch(0.50 0.16 80)`
Font 11/14, weight 500
Optional shield icon, 11px

### ModePill (composer mode chips)

Height 34, padding 0 14, radius 17, gap 7
Inactive: 1px `border/subtle`, color `text/secondary`
Active: 1px `text/primary` border, color `text/primary`

### Composer (centered)

Container: bg `bg/surface`, 1px `border/subtle`, radius 18,
padding 20 22 14
Placeholder: 15/22, color `text/tertiary`
Action row: 32px chips with 16 radius, send button 36 round in primary

### ContinueCard

Padding 18 20, radius 14, bg `bg/surface`, 1px `border/subtle`
Status row: 7px dot + status label (caption) + tag (right)
Title: 13.5/1.4 weight 500
Meta: 11.5 `text/tertiary`

### SidebarNavItem

Height 34, margin 0 10, padding 0 14, radius 10
Default: color `text/secondary`, weight 400, transparent
Active: color `text/primary`, weight 500, bg `rgba(20,22,26,0.05)`
Icon: 16, color `text/tertiary` (default) / `text/primary` (active)
Optional trailing badge: 11 px tabular-nums in `text/muted`

### SidebarSectionLabel

Padding 0 24 8, font 11/14, weight 500, letter-spacing 0.02em,
color `text/muted`

### Toggle

32 × 18 track, 14 × 14 knob, 9 px radius
Off: bg `bg/muted`, knob `bg/surface`
On: bg `accent`, knob `bg/surface`
Animation: knob left 2 → 16, 180ms

### StatusBar (Workspace top)

Height 56, marginTop 32 (clear traffic lights), padding 0 24 0 32
Pulsing dot: 8px (with 16px halo)
Title block: 13.5 weight 500 / 11 secondary line
Right cluster: model · runtime · cost (vertically stacked label +
value, 1px separators 22 high), approval pill, pause/stop icon
buttons

### InspectorBlock

Section label: 11 uppercase 0.04em, badge optional
Tool call card: header bar (10/12 padding, dot + monospace function
name + "running" shimmer), body `<pre>` 11px monospace
Approval row: card with shield icon + "Review" pill button
Memory used / Files touched / Sources rows: 22px square avatar +
12px label + 10.5px subtext

### Modal (Approval)

Width 540, radius 18
Shadow: `shadow/modal`
Backdrop: `rgba(20,22,26,0.30)`
Padding: 28/32 (header), 20/32 (sections), 20/32 (actions, with
top border)

### ProviderCard / IntegrationCard / SkillCard

Padding 20, radius 14, bg `bg/surface`, 1px `border/subtle`
Avatar: 36×36 (provider) / 38×38 (skill, integration), radius 10
Letter avatar: white text, 16-17 weight 600
Trailing more-button: ghost, 14px icon

### ProgressBar

Height 4 (or 2 in dense), radius 2, bg `bg/muted`
Fill: `accent` (or success green when 100%)

### Toast / Banner (Approval needed)

Background `oklch(0.78 0.16 80 / 0.06)`, 1px `oklch(0.78 0.16 80 / 0.20)`,
radius 10
Padding 10/12, gap 10

==================================================
SCREEN ANATOMIES
==================================================

All screens are 1440 × 900 with macOS chrome (3 traffic-light dots
top-left). Universal patterns:

- Page padding: 32 horizontal, 24+ vertical
- Section label margin-bottom: 14
- Cards float on white (no shadows except modals)
- Borders are `border/subtle` (6% black) by default
- Animated states: hd-pulse for status dots, hd-shimmer for
  "running" tags, Dots typing indicator (3 dots staggered)

### Screen 01 · Home (Phase 1)

Anatomy: Sidebar 244 → Topbar 56 (empty title) → Hero (88px top
padding).

- Soft glyph tile (56×56, radius 16, bg `bg/subtle`)
- H1 "Good morning, [Name]." centered + tertiary subtitle
- Mode pill row (5 pills): Plan, Research, Operate browser, Build
  app, Recall memory
- Composer (centered, max-width 720)
- 3 suggestion chips
- Bottom band: "Continue where you left off" with 3 cards
  (running / waiting / success)

Reference JSX: handoff/refs/home.jsx (and home_v2/v3)

### Screen 02 · Tasks list (Phase 10)

Anatomy: Sidebar → Topbar (search + filter + new) → Tabs (Active 4 /
Waiting 2 / Completed 38 / All) → Table.

- Columns: status dot, Task (title + sub), Source, Started, Cost,
  Status pill, more
- Row height ~64 (14 padding), radius 12 hover
- Status dot pulses for running tasks

### Screen 03 · Live Workspace (Phase 1)

Anatomy: Status bar 56 → 3-column grid (320 / 1fr / 320) → Bottom
composer.

Status bar: pulsing dot, title, live action, model · runtime · cost,
approval pill, pause + stop

Left pane: segmented `Chat | Plan | Timeline`
- Chat: avatar messages, "working" state with animated dots
- Plan: 7-step list with done/active/pending dots and connector
  line
- Timeline: time-coded events, color-coded dots by kind, monospace
  tool calls

Center pane: tabbed surface
- Browser: address bar + content with cursor + tooltips
- Terminal: dark surface with curl + jq commands, blinking cursor
- Preview: file preview (CSV table, image, etc.)

Right inspector: Current tool call, Approvals, Memory used,
Files touched, Sources

Bottom composer: "Add an instruction mid-task — Handle will weave
it in." + attach + mic + send

Reference JSX: handoff/refs/workspace.jsx (and workspace_v2/v3)

### Screen 04 · Approval modal (Phase 1)

540-wide centered modal over dimmed background.
- "NEEDS APPROVAL" pill (orange)
- Title: "Send 14 emails to design partners"
- Plan rows with risk dots (low/med), highlighted action row
- Scope chips (Gmail · send, Linear · read, Memory · write)
- Footer: "Trust similar runs" toggle + Decline + Approve & run

Reference JSX: handoff/refs/approval.jsx

### Screen 05 · Wide Research (Phase 7 — research skill)

3-column (300 / 1fr / 280):
- Plan tree (indented research outline)
- Report (max-width 640, H1 + meta, body with citation chips)
- Sources list (numbered, domain + title)

Reference JSX: handoff/refs/research.jsx

### Screen 06 · Memory graph (Phase 5)

3-column (220 / 1fr / 320):
- Facets: Kind (color swatches + counts), Source
- Graph: SVG nodes color-coded by kind, lines for relations,
  primary entity highlighted
- Entity detail: project, key facts with confidence bars
  (94% / 88% / etc.), recent updates list

Reference JSX: handoff/refs/memory.jsx

### Screen 07 · Skills (Phase 7)

- "Installed" grid (3 cols × N) — letter avatars + verified
  checkmarks + usage caption
- "Recent runs" table — skill | action | time | cost | status

### Screen 08 · Schedules (Phase 8)

- Today timeline strip (24-hour scrubber with NOW line and pill
  events)
- All schedules table: dot · name (NEW badge) + cron · last ·
  next · toggle · more

### Screen 09 · Onboarding · Connect tools (Phase 11)

- Left rail: 5-step list with done / active circles
- Main: H1 "Connect the tools Handle can use", 3×3 provider grid,
  footer with Skip / Back / Continue

### Screen 10 · Integrations (Phase 6)

- "Connected · 4" — 2×2 grid of cards with avatar, account, scope
  chips, health pill
- "Available" — 4-column letter grid with Connect pills

### Screen 11 · Settings · Profile (Phase 11)

2-column (220 settings nav / 1fr content max-width 760):
- Profile fields (Name, Email, Display name)
- Defaults (model chip, time zone, working hours)
- Behavior toggles (voice mode, read aloud, approval sound)

==================================================
ICONS
==================================================

The design package ships 30+ inline SVG icons at 24×24 base, 1.6
stroke. Source in handoff/icons.jsx.

To use:

```tsx
import { ChevronRight, MessagesSquare, Brain, ... } from '@handle/design-refs/icons';
```

Or, since lucide-react is widely available and matches the visual
style closely:

```tsx
import { ChevronRight, MessagesSquare, Brain } from 'lucide-react';
```

Either works. lucide-react is recommended for breadth (1500+
icons covering future needs).

If a specific icon from the design package isn't in lucide-react,
fall back to the design package's SVG.

==================================================
DARK MODE
==================================================

Dark mode is implied by the token structure but not designed in
the initial package. Phase 11 polish phase implements dark mode
by:

1. Defining a parallel set of tokens for dark surfaces:
   - bg/canvas: #15171A
   - bg/surface: #1F2024
   - text/primary: #F5F5F1
   - etc.
2. Using Tailwind's class-based dark mode strategy
3. Toggling via a Settings → General → Theme dropdown

Until Phase 11, ship with light mode only. Do not attempt dark
mode partially during earlier phases.

==================================================
RESPONSIVE LAYOUT
==================================================

Per the design package, screens are designed at 1440×900 desktop
size. Responsive scaling happens at:

- < 1280px: right inspector pane in Workspace becomes a slide-over
  drawer (toggleable)
- < 1024px: sidebar collapses to icon-only
- < 768px: not supported — show "Handle works best on desktop"
  message

Phase 11 polish implements responsive. Until then, optimize for
1440×900.

==================================================
EMPTY STATES
==================================================

The design package notes empty states are not specced. Until
Phase 11 designs them properly, use a consistent placeholder:

```tsx
<div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
  <div className="mb-3 w-12 h-12 rounded-2xl bg-bg-subtle flex items-center justify-center">
    <Icon className="w-6 h-6 text-text-tertiary" />
  </div>
  <h3 className="text-base font-medium text-text-primary mb-1">{title}</h3>
  <p className="text-sm text-text-tertiary max-w-xs">{description}</p>
  {action && <div className="mt-4">{action}</div>}
</div>
```

==================================================
LOGO AND BRAND
==================================================

The design package contains logo work in handoff/refs/ and
logo/. Final wordmark is TBD per the handoff README.

For Phase 1, use a placeholder glyph (a "h" rendered as a filled
square in `bg/inverse`) plus the "Handle" wordmark in SF Pro
Display medium.

```tsx
function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-md bg-bg-inverse flex items-center justify-center">
        <span className="text-white font-display font-semibold text-sm">h</span>
      </div>
      <span className="font-display font-medium text-base text-text-primary">Handle</span>
    </div>
  );
}
```

When the final wordmark lands, swap the placeholder.

==================================================
HANDOFF FILES TO COPY
==================================================

When initializing the Handle repo (Phase 1), copy these files
from the design package:

```
hipp0-2.zip/
  ├── handoff/tokens.json   → packages/design-tokens/tokens.json
  ├── handoff/tokens.css    → packages/design-tokens/tokens.css
  ├── handoff/icons.jsx     → packages/design-refs/icons.jsx
  ├── handoff/refs/         → packages/design-refs/refs/
  ├── handoff/README.md     → packages/design-refs/README.md
  ├── handoff/component-specs.md → packages/design-refs/component-specs.md
  ├── handoff/screen-specs.md    → packages/design-refs/screen-specs.md
  └── handoff/figma-spec.md      → packages/design-refs/figma-spec.md
```

Do NOT copy:
- The HTML preview files (`*.html` at zip root) — these are
  Figma-canvas exports, not production assets
- The `screens/` folder at zip root — these are duplicates of
  handoff/refs/
- `design-canvas.jsx`, `macos-window.jsx` — designer tooling
- `uploads/` folder — design exploration screenshots

==================================================
END OF DESIGN SYSTEM SPEC
==================================================
