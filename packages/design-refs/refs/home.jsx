/* global React, I, AppShellV2, TopbarV2, ComposerV2, PillBtn, SHELL_W, SHELL_H */

function ScreenHomeV2() {
  return (
    <AppShellV2 active="home">
      <TopbarV2
        title=""
        right={<>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 14px', borderRadius: 17, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <I.Sparkles size={13} /> Temporary
          </button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'oklch(0.62 0.18 250)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>R</div>
        </>}
      />

      {/* Main content area — generous whitespace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Hero */}
        <div style={{
          padding: '88px 64px 48px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 32,
        }}>
          {/* Glyph */}
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: '#F4F3EE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M7 5v18M7 14h14M21 5v18" stroke="#15171A" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>

          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h1 style={{
              margin: 0,
              fontSize: 30, fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
            }}>Good morning, Rae.</h1>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--text-tertiary)', letterSpacing: '-0.005em' }}>What should we get done today?</p>
          </div>

          {/* Mode pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 720 }}>
            <ModePill icon={I.Sparkles} label="Plan a task" active />
            <ModePill icon={I.Globe} label="Research" />
            <ModePill icon={I.Browser} label="Operate browser" />
            <ModePill icon={I.Code} label="Build an app" />
            <ModePill icon={I.Memory} label="Recall memory" />
          </div>

          {/* Composer */}
          <ComposerV2 placeholder="Describe what you'd like Handle to do…" />

          {/* Suggestions row */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 760, marginTop: 4 }}>
            <SuggestionChip>Summarize unread Slack since Friday</SuggestionChip>
            <SuggestionChip>Prep brief for Thursday Lattice review</SuggestionChip>
            <SuggestionChip>Find 5 design partners for waitlist</SuggestionChip>
          </div>
        </div>

        {/* Continue band — quietly tucked at bottom */}
        <div style={{
          marginTop: 'auto',
          padding: '0 64px 40px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '-0.005em' }}>Continue where you left off</div>
            <button style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>View all tasks →</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <ContinueCard
              status="running"
              title="Pull Q2 churn cohorts from Mixpanel"
              meta="Step 4 of 7 · ~3 min remaining"
              tag="Browser"
            />
            <ContinueCard
              status="waiting"
              title="Draft launch announcement for Loop"
              meta="Waiting for your approval"
              tag="Writing"
            />
            <ContinueCard
              status="success"
              title="Refactor settings page in handle-web"
              meta="Completed 22 min ago · 6 files changed"
              tag="Build"
            />
          </div>
        </div>
      </div>
    </AppShellV2>
  );
}

function ModePill({ icon: IconC, label, active }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      height: 34, padding: '0 14px',
      borderRadius: 17,
      background: active ? 'var(--bg-surface)' : 'transparent',
      border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
      fontSize: 12.5, fontWeight: 500,
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      letterSpacing: '-0.005em',
      cursor: 'pointer',
    }}>
      <IconC size={13} style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }} />
      {label}
    </button>
  );
}

function SuggestionChip({ children }) {
  return (
    <button style={{
      height: 32, padding: '0 14px',
      borderRadius: 16,
      background: 'transparent',
      border: '1px solid var(--border-subtle)',
      fontSize: 12.5, color: 'var(--text-secondary)',
      letterSpacing: '-0.005em',
      cursor: 'pointer',
      textAlign: 'left',
    }}>{children}</button>
  );
}

function ContinueCard({ status, title, meta, tag }) {
  const statusColor = {
    running: 'oklch(0.62 0.18 250)',
    waiting: 'oklch(0.78 0.16 80)',
    success: 'oklch(0.55 0.16 145)',
  }[status];
  const statusLabel = { running: 'Running', waiting: 'Waiting', success: 'Done' }[status];

  return (
    <div style={{
      padding: '18px 20px',
      borderRadius: 14,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', gap: 12,
      cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {status === 'running' ? (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 0 4px ${statusColor.replace(')', ' / 0.15)')}` }} />
        ) : (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
        )}
        <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 500, letterSpacing: '0.005em' }}>{statusLabel}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.005em' }}>{tag}</span>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500, letterSpacing: '-0.005em', lineHeight: 1.4 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', letterSpacing: '-0.002em' }}>{meta}</div>
    </div>
  );
}

window.ScreenHomeV2 = ScreenHomeV2;
