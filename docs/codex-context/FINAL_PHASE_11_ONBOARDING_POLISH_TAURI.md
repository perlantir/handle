# Handle — Phase 11: Onboarding + Polish + Tauri (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1-10 SIGNOFFs before starting.

==================================================
GOAL
==================================================

The final phase. Polish Handle to ship-ready quality and package
it as a Mac app via Tauri.

After Phase 11, Handle is feature-complete and distributable.

Phase 11 ships in 2-3 weeks.

==================================================
SCOPE
==================================================

In scope:
- First-run onboarding (Screen 09)
- Documentation
- Loading states everywhere
- Error states with actionable messages
- Keyboard shortcuts
- Dark mode
- Responsive layout
- Empty states
- Settings completeness across all tabs
- Tauri configuration
- Code signing
- DMG build pipeline

Out of scope:
- Distribution beyond Mac (Linux, Windows)
- Auto-update mechanism beyond basic plumbing (Sparkle integration
  is enough)
- App Store submission (out of scope; direct distribution only)

==================================================
ONBOARDING (SCREEN 09)
==================================================

apps/web/app/(onboarding)/page.tsx — separate route that runs on
first sign-in until completed.

User flow:

1. **Welcome**
   - Logo + "Welcome to Handle"
   - "Handle is your personal AI agent..."
   - Continue button

2. **Sign in (if not already)**
   - Clerk sign-in component
   - On success, advance

3. **Connect a provider** (required)
   - Provider grid (Screen 09 design)
   - User clicks one of: OpenAI, Anthropic, QWEN, KIMI, xAI, Local
   - Setup flow per provider (API key or OAuth)
   - At least one must be connected to continue

4. **Connect integrations** (optional)
   - Same grid, with Gmail, GitHub, Notion, Vercel
   - Skip allowed

5. **Pick default backend**
   - Radio: E2B Cloud (recommended) / Local Mac (advanced)
   - For Local: explain workspace dir, safety governor

6. **Pick default browser mode**
   - Radio: Separate profile (recommended) / Use my Chrome (advanced)

7. **Tour**
   - Animated walkthrough of Workspace (Screen 03)
   - Highlights: composer, plan tab, browser tab, approval flow
   - Skip allowed

Layout:
- Left rail: 5-step list (per Screen 09)
- Main: current step content
- Footer: Skip / Back / Continue

```tsx
const steps = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'signin', label: 'Sign in' },
  { id: 'provider', label: 'Connect a model' },
  { id: 'integrations', label: 'Connect tools' },
  { id: 'preferences', label: 'Set preferences' },
];
```

Mark onboarding complete in user record:

```prisma
model User {
  // ...
  onboardingCompletedAt DateTime?
}
```

Middleware redirects to /onboarding until completed.

==================================================
DOCUMENTATION
==================================================

Create at /docs (in repo, NOT in app):

- README.md — what Handle is, quick start
- SETUP.md — full local setup instructions
- PROVIDERS.md — how to configure each LLM provider
- LOCAL_EXECUTION.md — using local backend safely
- INTEGRATIONS.md — connecting Gmail, GitHub, Notion, Vercel
- SKILLS.md — using and creating skills
- SCHEDULES.md — scheduling tasks
- VOICE.md — voice input/output
- TROUBLESHOOTING.md — common issues
- ARCHITECTURE.md — high-level system design

Include:
- Screenshots of major screens
- Step-by-step walkthroughs
- API key acquisition instructions per provider
- Nango setup walkthrough (cloud vs self-hosted)
- Zep setup walkthrough

==================================================
LOADING STATES
==================================================

Audit every async UI surface. Add a loading state matching the
design system:

```tsx
function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-text-tertiary text-sm">
      <Spinner className="w-4 h-4" />
      <span>{label}</span>
    </div>
  );
}
```

Surfaces requiring loading states:
- Initial app load (skeleton)
- Provider list loading
- Integration list loading
- Memory graph loading
- Tasks list loading
- Skill detection (sub-second; spinner OK)
- Voice transcription
- TTS playback

==================================================
ERROR STATES
==================================================

Standardize error handling:

```tsx
function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
      <div className="w-12 h-12 rounded-2xl bg-status-error/10 flex items-center justify-center mb-3">
        <AlertCircle className="w-6 h-6 text-status-error" />
      </div>
      <h3 className="font-medium text-text-primary mb-1">{title}</h3>
      {description && <p className="text-sm text-text-tertiary max-w-xs">{description}</p>}
      {action && (
        <PillButton variant="secondary" size="sm" onClick={action.onClick} className="mt-4">
          {action.label}
        </PillButton>
      )}
    </div>
  );
}
```

Common error scenarios:
- API request failed
- Provider not configured
- Integration disconnected
- Backend unreachable
- Sandbox crashed
- LLM rate-limited

==================================================
KEYBOARD SHORTCUTS
==================================================

Implement global shortcuts via a single hook:

```typescript
useEffect(() => {
  function handler(e: KeyboardEvent) {
    if (!e.metaKey) return;
    
    switch (e.key) {
      case 'k':
        e.preventDefault();
        openCommandPalette();
        break;
      case 'n':
        e.preventDefault();
        router.push('/');  // New task
        break;
      case ',':
        e.preventDefault();
        router.push('/settings');
        break;
      case 'Enter':
        if (composerFocused) {
          e.preventDefault();
          submitTask();
        }
        break;
    }
  }
  
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, []);
```

Shortcut list (display in Settings → Keyboard):
- ⌘K — command palette
- ⌘N — new task
- ⌘, — settings
- ⌘Enter — submit task in composer
- ⌘/ — keyboard shortcut help
- Esc — close modal / cancel

==================================================
DARK MODE
==================================================

Implement dark mode by:

1. Adding parallel dark tokens to tokens.json:
```json
{
  "color": {
    "bg": {
      "canvas": { "value": "#FAFAF7", "dark": "#15171A" },
      "surface": { "value": "#FFFFFF", "dark": "#1F2024" }
    }
  }
}
```

2. Updating tokens.css with `.dark` variant:
```css
:root { --color-bg-canvas: #FAFAF7; }
.dark { --color-bg-canvas: #15171A; }
```

3. Tailwind config: `darkMode: 'class'`

4. ThemeProvider component using class on <html>:
```tsx
useEffect(() => {
  const theme = localStorage.getItem('theme') ?? 'light';
  document.documentElement.classList.toggle('dark', theme === 'dark');
}, []);
```

5. Settings → General → Theme dropdown (Light / Dark / System)

Audit every component to verify dark mode rendering. Adjust any
hardcoded colors to use tokens.

==================================================
RESPONSIVE LAYOUT
==================================================

Three breakpoints (per FINAL_DESIGN_SYSTEM.md):
- 1280px: right inspector becomes drawer
- 1024px: sidebar becomes icon-only
- 768px: show "best on desktop" message

Implementation:
- Use Tailwind's responsive variants (`lg:`, `md:`, `sm:`)
- Test each screen at all breakpoints
- Mobile blocker page at < 768px

==================================================
EMPTY STATES
==================================================

Audit every surface. Replace placeholder text with proper empty
states:

- /tasks (no tasks): "Your tasks will appear here. Submit a goal
  on Home to get started."
- /memory (no memories yet): "Memories grow as you use Handle."
- /skills (none used): "Click Use Skill to try one."
- /schedules (no schedules): "Create a recurring task."
- /integrations (none connected): "Connect your tools."
- /templates (none): "Save tasks as templates for reuse."

==================================================
SETTINGS COMPLETENESS
==================================================

Audit each Settings tab. Per Screen 11 design.

Tabs (220px sidebar):
- Profile (Screen 11 base)
  - Name, email, display name
  - Avatar upload
  - Account deletion
- Providers (Phase 2)
- Integrations (Phase 6)
- Execution (Phase 4)
- Browser (Phase 4)
- Memory (Phase 5)
- Skills (Phase 7)
- Schedules (Phase 8)
- Voice (Phase 9)
- Sharing (Phase 10) — sharing defaults
- Observability (Phase 1+) — LangSmith config, log directory
- Keyboard
- General
  - Theme (Light / Dark / System)
  - Language (English only for v1)
  - Reset settings
  - About (version, build, build commit)

==================================================
TAURI PACKAGING
==================================================

Tauri wraps the Next.js frontend + Express backend into a Mac
.app bundle.

Setup:

```bash
pnpm add -D @tauri-apps/cli @tauri-apps/api
pnpm tauri init
```

src-tauri/tauri.conf.json:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Handle",
  "version": "1.0.0",
  "identifier": "com.perlantir.handle",
  "build": {
    "frontendDist": "../apps/web/.next/static",
    "devUrl": "http://localhost:3000",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "Handle",
        "width": 1440,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 768,
        "decorations": true,
        "transparent": false,
        "fullscreen": false
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/[email protected]", "icons/icon.icns"],
    "macOS": {
      "frameworks": [],
      "minimumSystemVersion": "10.15",
      "exceptionDomain": "",
      "signingIdentity": "Developer ID Application: ...",
      "providerShortName": null,
      "entitlements": "entitlements.plist"
    }
  }
}
```

The Express backend needs to start as a Tauri sidecar. Configure:

```rust
// src-tauri/src/main.rs
use tauri::{Manager};

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let resource_path = app.path().resolve("api", tauri::path::BaseDirectory::Resource)?;
      // Spawn the Express backend
      tauri::async_runtime::spawn(async move {
        let _ = tokio::process::Command::new(resource_path.join("api"))
          .spawn()
          .expect("Failed to start API");
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

The API binary is bundled via:
1. `pnpm --filter @handle/api build` produces a Node binary
2. Use `pkg` or `nexe` to compile to a single executable
3. Place in src-tauri/binaries/api-aarch64-apple-darwin

==================================================
CODE SIGNING
==================================================

Required for distribution outside the Mac App Store. Steps:

1. Get an Apple Developer account ($99/year)
2. Generate a "Developer ID Application" certificate
3. Configure tauri.conf.json with the signing identity
4. Configure entitlements.plist:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
  </dict>
</plist>
```

5. Notarize: `xcrun notarytool submit Handle.dmg --apple-id ... --team-id ... --password ...`

==================================================
BUILD PIPELINE
==================================================

GitHub Actions workflow for releases:

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: macos-14  # Apple Silicon
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install
      - run: pnpm build
      - name: Build API binary
        run: pnpm --filter @handle/api build:binary
      - name: Tauri build
        run: pnpm tauri build --target aarch64-apple-darwin
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - uses: softprops/action-gh-release@v2
        with:
          files: src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
```

==================================================
AUTO-UPDATE
==================================================

Tauri supports auto-update via the `tauri-plugin-updater` plugin.

Configure update endpoint in tauri.conf.json:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/perlantir/handle/releases/latest/download/latest.json"
    ],
    "pubkey": "..."
  }
}
```

GitHub Actions publishes a `latest.json` artifact alongside the
DMG. Tauri checks this on launch.

For Phase 11, basic update plumbing is enough. User manually
clicks Settings → About → Check for updates.

==================================================
TESTS
==================================================

1. Onboarding flow completes
2. Onboarding redirect logic
3. Each Settings tab renders without errors
4. Keyboard shortcuts fire correct actions
5. Dark mode toggle persists and applies
6. Responsive: layouts at 1024px and 1280px don't break
7. Empty states render

==================================================
GATE CRITERIA
==================================================

1. All Phase 1-10 tests pass
2. Phase 11 tests pass 3 consecutive CI runs
3. New user completes onboarding end-to-end
4. All Settings tabs work
5. Dark mode renders all screens correctly
6. Responsive at 1024px and 1280px
7. Tauri build produces signed DMG
8. DMG installs and runs Handle natively
9. Onboarding works in the Tauri app
10. Documentation complete (README, SETUP, etc.)
11. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase11-onboarding-polish-tauri.md:

Section A: Onboarding (web)
1. Sign out
2. Sign up new account
3. Verify redirect to /onboarding
4. Complete each step
5. Verify redirect to /
6. Verify subsequent sign-in skips onboarding

Section B: Settings completeness
1. Visit each tab
2. Verify all UI elements work
3. Verify changes persist after reload

Section C: Dark mode
1. Settings → General → Theme → Dark
2. Verify all screens render in dark mode without contrast issues
3. Verify Memory graph, Workspace, Approval modal all work

Section D: Responsive
1. Resize browser to 1280px
2. Verify right inspector becomes drawer
3. Resize to 1024px
4. Verify sidebar becomes icon-only
5. Resize to 768px
6. Verify mobile blocker

Section E: Tauri build
1. `pnpm tauri build`
2. Verify .app and .dmg artifacts
3. Open .dmg, drag Handle.app to Applications
4. Launch from Applications
5. Verify no Gatekeeper warnings (signed)
6. Verify onboarding flow runs in Tauri app
7. Verify canonical task completes in Tauri app

==================================================
IMPLEMENTATION ORDER
==================================================

1. Onboarding flow
2. Onboarding redirect middleware
3. Documentation files
4. Loading states audit
5. Error states audit
6. Keyboard shortcuts
7. Dark mode tokens
8. Dark mode component audit
9. Theme picker in Settings
10. Responsive breakpoints
11. Empty states audit
12. Settings tab completeness
13. About screen with version info
14. Tauri configuration
15. Tauri sidecar (Express bundling)
16. Code signing setup
17. CI release workflow
18. Auto-update plumbing
19. Tests
20. Manual audit
21. SIGNOFF — final

==================================================
END OF PHASE 11 SPEC
==================================================

After Phase 11 ships, Handle is feature-complete and
distributable as a native Mac app.

Future phases (12+) might add:
- Image / video generation tools
- Mobile app
- Plugin marketplace
- API for third-party integration
- Linux / Windows builds
- Mac App Store submission

These are out of scope for this spec set. They get their own
spec arc when planned.
