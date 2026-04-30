# Handle — Screen Specs

All screens are **1440 × 900** with macOS chrome (3 traffic-light dots top-left).

## 01 · Home
**Anatomy:** Sidebar 244 → Topbar 56 (empty title) → Hero (88 px top padding).
- Soft glyph tile (56 × 56, radius 16, bg `bg/subtle`)
- H1 "Good morning, Rae." centered + tertiary subtitle
- Mode pill row (5 pills): Plan, Research, Operate browser, Build app, Recall memory
- Composer (centered, max-width 720)
- 3 suggestion chips
- Bottom band: "Continue where you left off" with 3 cards (running / waiting / success)

## 02 · Tasks list
**Anatomy:** Sidebar → Topbar (search + filter + new) → Tabs (Active 4 / Waiting 2 / Completed 38 / All) → Table.
- Columns: status dot, Task (title + sub), Source, Started, Cost, Status pill, more
- Row height ~ 64 (14 padding), radius 12 hover
- Status dot pulses for running tasks

## 03 · Live Workspace (3-pane)
**Anatomy:** Status bar 56 → 3-column grid (320 / 1fr / 320) → Bottom composer.
- **Status bar:** pulsing dot, title "Pull Q2 churn cohorts from Mixpanel", live action "Inspecting pricing page…", model · runtime · cost, approval pill (2 pending), pause + stop
- **Left pane:** segmented `Chat | Plan | Timeline`
  - Chat: avatar messages, "working" state with animated dots
  - Plan: 7-step list with done / active / pending dots and connector line, approval flag on email step
  - Timeline: time-coded events, color-coded dots by kind (plan / tool / browser / memory), monospace tool calls
- **Center pane:** tabbed surface
  - Browser: address bar + cohort retention chart with cursor + "Click Export → CSV" tooltip
  - Terminal: dark surface with curl + jq commands, blinking cursor
  - Preview: q2-churn.csv table preview
- **Right inspector:** Current tool call (browser.click with selector json), Approvals (2 with Review buttons), Memory used (3 entities), Files touched (q2-churn.csv generating, summary pending), Sources (mixpanel.com, kiwi.notion.site)
- **Bottom composer:** "Add an instruction mid-task — Handle will weave it in." + attach + mic + send

## 04 · Approval modal
540-wide centered modal over dimmed Tasks list.
- "NEEDS APPROVAL" pill (orange)
- Title: "Send 14 emails to design partners"
- Plan rows with risk dots (low/med), highlighted "Send via Gmail" row
- Scope chips (Gmail · send, Linear · read, Memory · write)
- Footer: "Trust similar runs" toggle + Decline (secondary pill) + Approve & run (dark pill)

## 05 · Wide Research
3-column (300 / 1fr / 280):
- **Plan tree** (indented research outline with done / active / pending markers)
- **Report** (max-width 640, H1 + meta, body with **citation chips** `Cite n`)
- **Sources** list (numbered, domain + title)

## 06 · Memory graph
3-column (220 / 1fr / 320):
- **Facets:** Kind (color swatches + counts), Source
- **Graph:** SVG nodes color-coded by kind, lines for relations, "Rae" highlighted as primary
- **Entity detail:** Project · Handle, key facts with confidence bars (94 % / 88 % / 100 % / 62 %), recent updates list

## 07 · Skills
- "Installed" grid (3 cols × N) — letter avatars + verified checkmarks + usage caption
- "Recent runs" table — skill | action | time | cost | status (ok / approved)

## 08 · Schedules
- Today timeline strip (24-hour scrubber with NOW line and pill events)
- All schedules table: dot · name (NEW badge) + cron · last · next · toggle · more

## 09 · Onboarding · Connect tools
- Left rail: 5-step list with done / active circles
- Main: H1 "Connect the tools Handle can use", 3 × 3 provider grid, footer with Skip / Back / Continue

## 10 · Integrations
- "Connected · 4" — 2 × 2 grid of cards with avatar, account, scope chips, health pill
- "Available" — 4-column letter grid with Connect pills

## 11 · Settings · Profile
2-column (220 settings nav / 1fr content max-width 760):
- Profile fields (Name, Email, Display name)
- Defaults (model chip, time zone, working hours)
- Behavior toggles (voice mode, read aloud, approval sound)

## Universal patterns
- Page padding 32 horizontal, 24+ vertical
- Section label margin-bottom 14
- Cards float on white (no shadows except modals)
- Borders are `border/subtle` (6% black) by default
- Animated states: `hd-pulse` for status dots; `hd-shimmer` for "running" tags; `Dots` typing indicator (3 dots staggered)
