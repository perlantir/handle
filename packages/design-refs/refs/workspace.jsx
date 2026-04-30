/* global React, I, AppShellV2 */

function ScreenWorkspaceV2() {
  return (
    <AppShellV2 active="workspace">
      <StatusBar />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr 320px', overflow: 'hidden', minHeight: 0 }}>
        {/* LEFT — conversation + plan + timeline */}
        <LeftPane />

        {/* CENTER — tabbed surface */}
        <CenterPane />

        {/* RIGHT — inspector */}
        <RightInspector />
      </div>

      {/* BOTTOM composer */}
      <BottomComposer />
    </AppShellV2>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* TOP STATUS BAR                                              */
/* ──────────────────────────────────────────────────────────── */
function StatusBar() {
  return (
    <header style={{
      height: 56, marginTop: 32, flexShrink: 0,
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px 0 32px', gap: 14,
    }}>
      {/* Working dot + title */}
      <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'oklch(0.62 0.18 250)' }} />
        <span className="pulse-dot" style={{ position: 'absolute', inset: -4, width: 16, height: 16, borderRadius: '50%', background: 'oklch(0.62 0.18 250 / 0.20)', animation: 'hd-pulse 1.6s ease-in-out infinite' }} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Pull Q2 churn cohorts from Mixpanel
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'oklch(0.62 0.18 250)', fontWeight: 500 }}>Inspecting pricing page…</span>
        </div>
      </div>

      <span style={{ flex: 1 }} />

      {/* Meta chips */}
      <Meta label="Model" value="claude-4.5-sonnet" />
      <Sep />
      <Meta label="Runtime" value="03:42" mono />
      <Sep />
      <Meta label="Cost" value="$0.18 / $1.50" mono />
      <Sep />

      {/* Approval queue */}
      <button style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 32, padding: '0 12px',
        borderRadius: 16,
        background: 'oklch(0.78 0.16 80 / 0.16)',
        color: 'oklch(0.50 0.16 80)',
        border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
      }}>
        <I.Shield size={12} /> 2 pending
      </button>

      {/* Pause / Stop */}
      <button style={iconBtn}><I.Pause size={13} /></button>
      <button style={{ ...iconBtn, color: 'oklch(0.60 0.20 25)' }}><I.Stop size={13} /></button>
    </header>
  );
}

const iconBtn = {
  width: 32, height: 32, borderRadius: 16,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-secondary)', cursor: 'pointer',
};

function Meta({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0, lineHeight: 1.1 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
function Sep() { return <span style={{ width: 1, height: 22, background: 'var(--border-subtle)' }} />; }

/* ──────────────────────────────────────────────────────────── */
/* LEFT PANE                                                   */
/* ──────────────────────────────────────────────────────────── */
function LeftPane() {
  const [tab, setTab] = React.useState('plan');
  return (
    <div style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* segmented */}
      <div style={{ padding: '14px 20px 12px', display: 'flex', gap: 4 }}>
        {[['chat','Chat'],['plan','Plan'],['timeline','Timeline']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            height: 28, padding: '0 12px', borderRadius: 14,
            fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
            background: tab === k ? 'var(--bg-surface)' : 'transparent',
            border: tab === k ? '1px solid var(--border-subtle)' : '1px solid transparent',
            color: tab === k ? 'var(--text-primary)' : 'var(--text-tertiary)',
            cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 16px' }} className="scroll">
        {tab === 'chat' && <Conversation />}
        {tab === 'plan' && <Plan />}
        {tab === 'timeline' && <Timeline />}
      </div>
    </div>
  );
}

function Conversation() {
  return (
    <div style={{ padding: '4px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Msg from="you" text="Pull Q2 churn cohorts from Mixpanel and email Dani a summary by 3pm." />
      <Msg from="agent" text="On it. I'll grab the cohort retention chart, export the raw data, write a 5-bullet summary, and queue an email to Dani for your approval." />
      <Msg from="agent" working text="Inspecting pricing page to confirm tier definitions before pulling cohorts…" />
    </div>
  );
}

function Msg({ from, text, working }) {
  const isAgent = from === 'agent';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: isAgent ? '#15171A' : 'oklch(0.62 0.18 250)',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 600,
      }}>{isAgent ? 'H' : 'R'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, letterSpacing: '0.005em' }}>{isAgent ? 'Handle' : 'You'}{working && ' · working'}</div>
        <div style={{
          fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, letterSpacing: '-0.005em',
          ...(working ? { color: 'var(--text-secondary)' } : null),
        }}>
          {text}
          {working && <span style={{ display: 'inline-block', marginLeft: 6, verticalAlign: 'middle' }}><Dots /></span>}
        </div>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: '50%',
          background: 'oklch(0.62 0.18 250)',
          animation: `hd-pulse 1.4s ease-in-out ${i * 0.18}s infinite`,
        }}/>
      ))}
    </span>
  );
}

function Plan() {
  const steps = [
    { label: 'Plan run', sub: '7 steps · est 4 min', state: 'done' },
    { label: 'Connect to Mixpanel', sub: 'OAuth · rae@kiwi.co', state: 'done' },
    { label: 'Open insights workspace', sub: 'project 2418301', state: 'done' },
    { label: 'Filter to Q2 cohorts', sub: 'Apr 1 – Jun 30 · weekly', state: 'active' },
    { label: 'Export to CSV', sub: '', state: 'pending' },
    { label: 'Save to Artifacts', sub: 'q2-churn.csv', state: 'pending' },
    { label: 'Draft email to Dani', sub: 'needs your approval', state: 'pending', flag: 'approval' },
  ];
  return (
    <div style={{ padding: '4px 12px 0' }}>
      <div style={{ position: 'relative', paddingLeft: 14 }}>
        <div style={{ position: 'absolute', left: 21, top: 12, bottom: 12, width: 1, background: 'var(--border-subtle)' }} />
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', alignItems: 'flex-start' }}>
            <PlanDot state={s.state} />
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 12.5,
                  fontWeight: s.state === 'active' ? 500 : 400,
                  color: s.state === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)',
                  letterSpacing: '-0.005em',
                }}>{s.label}</span>
                {s.flag === 'approval' && (
                  <span style={{ fontSize: 9.5, color: 'oklch(0.50 0.16 80)', fontWeight: 600, letterSpacing: '0.04em', padding: '1px 5px', borderRadius: 3, background: 'oklch(0.78 0.16 80 / 0.16)' }}>APPROVAL</span>
                )}
              </div>
              {s.sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanDot({ state }) {
  if (state === 'done') return (
    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'oklch(0.55 0.16 145)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4, zIndex: 1 }}>
      <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.5 4l1.8 1.8L6.5 2.4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );
  if (state === 'active') return (
    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'oklch(0.62 0.18 250)', boxShadow: '0 0 0 4px oklch(0.62 0.18 250 / 0.18)', flexShrink: 0, marginTop: 4, zIndex: 1 }} />
  );
  return <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--bg-canvas)', border: '1.5px solid var(--border-default)', flexShrink: 0, marginTop: 4, zIndex: 1 }} />;
}

function Timeline() {
  const events = [
    { t: '03:42', kind: 'browser', text: 'Inspecting pricing page', state: 'active' },
    { t: '03:38', kind: 'browser', text: 'Filtered cohorts to Q2 weekly', state: 'done' },
    { t: '03:35', kind: 'tool', text: 'mixpanel.search_cohorts({ q: "churn" })', state: 'done' },
    { t: '03:32', kind: 'memory', text: 'Recalled tier definitions', state: 'done' },
    { t: '03:30', kind: 'browser', text: 'Opened Mixpanel insights', state: 'done' },
    { t: '03:28', kind: 'tool', text: 'mixpanel.connect()', state: 'done' },
    { t: '03:26', kind: 'plan', text: 'Plan generated · 7 steps', state: 'done' },
  ];
  const colors = {
    plan: 'oklch(0.62 0.18 250)',
    tool: 'oklch(0.55 0.10 285)',
    browser: 'oklch(0.60 0.14 200)',
    memory: 'oklch(0.60 0.15 320)',
  };
  return (
    <div style={{ padding: '4px 20px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>
      {events.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 4px', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 40 }}>{e.t}</span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[e.kind], flexShrink: 0, marginTop: 5 }} />
          <span style={{
            flex: 1, fontSize: 12, lineHeight: 1.4,
            color: e.state === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: e.state === 'active' ? 500 : 400,
            fontFamily: e.kind === 'tool' ? 'var(--font-mono)' : 'var(--font-sans)',
            fontSize: e.kind === 'tool' ? 11.5 : 12,
            letterSpacing: '-0.005em',
          }}>{e.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* CENTER — tabbed surface (Browser / Terminal / Preview)      */
/* ──────────────────────────────────────────────────────────── */
function CenterPane() {
  const [tab, setTab] = React.useState('browser');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg-canvas)' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '14px 16px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <SurfaceTab active={tab === 'browser'} onClick={() => setTab('browser')} icon={I.Browser} label="Browser" sub="mixpanel.com" />
        <SurfaceTab active={tab === 'terminal'} onClick={() => setTab('terminal')} icon={I.Terminal} label="Terminal" sub="zsh" />
        <SurfaceTab active={tab === 'preview'} onClick={() => setTab('preview')} icon={I.Eye} label="Preview" sub="q2-churn.csv" />
        <span style={{ flex: 1 }} />
        <button style={iconBtn}><I.Refresh size={13}/></button>
        <button style={iconBtn}><I.ExternalLink size={13}/></button>
      </div>

      <div style={{ flex: 1, padding: 16, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'browser' && <BrowserSurface />}
        {tab === 'terminal' && <TerminalSurface />}
        {tab === 'preview' && <PreviewSurface />}
      </div>
    </div>
  );
}

function SurfaceTab({ active, onClick, icon: IconC, label, sub }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      height: 32, padding: '0 12px',
      borderRadius: 16,
      background: active ? 'var(--bg-surface)' : 'transparent',
      border: active ? '1px solid var(--border-subtle)' : '1px solid transparent',
      cursor: 'pointer',
    }}>
      <IconC size={13} style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', letterSpacing: '-0.005em' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{sub}</span>
    </button>
  );
}

function BrowserSurface() {
  return (
    <div style={{ height: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Browser address bar */}
      <div style={{ height: 40, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-subtle)' }}>
        <button style={{ ...iconBtn, width: 26, height: 26, borderRadius: 13 }}><I.Chevron size={11} style={{ transform: 'rotate(180deg)' }}/></button>
        <button style={{ ...iconBtn, width: 26, height: 26, borderRadius: 13 }}><I.Chevron size={11}/></button>
        <button style={{ ...iconBtn, width: 26, height: 26, borderRadius: 13 }}><I.Refresh size={11}/></button>
        <div style={{ flex: 1, height: 26, borderRadius: 13, background: 'var(--bg-canvas)', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          <I.Lock size={10} style={{ color: 'var(--text-muted)' }} />
          mixpanel.com/project/2418301/insights/cohorts
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'oklch(0.62 0.18 250)', fontWeight: 500, padding: '0 8px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.62 0.18 250)' }} />
          Operating
        </span>
      </div>

      {/* Browser body */}
      <div style={{ flex: 1, padding: 28, position: 'relative', minHeight: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Cohort retention</div>
        <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)', marginTop: 6, letterSpacing: '-0.015em' }}>Q2 2026 · weekly active accounts</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ width: 8, height: 2, background: 'oklch(0.62 0.18 250)', borderRadius: 1 }} /> Q2 2026
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ width: 8, height: 2, background: 'rgba(20,22,26,0.30)', borderRadius: 1 }} /> Q1 2026 (compare)
          </span>
        </div>

        <svg width="100%" height="280" style={{ marginTop: 20 }} viewBox="0 0 700 280" preserveAspectRatio="none">
          {[0,1,2,3,4].map(i => (
            <line key={i} x1="0" x2="700" y1={40+i*50} y2={40+i*50} stroke="rgba(20,22,26,0.06)" strokeWidth="1" />
          ))}
          <path d="M0 60 C 80 70, 160 50, 240 90 S 400 150, 500 170 S 640 220, 700 210" stroke="oklch(0.62 0.18 250)" strokeWidth="2.5" fill="none" />
          <path d="M0 60 C 80 70, 160 50, 240 90 S 400 150, 500 170 S 640 220, 700 210 L 700 280 L 0 280 Z" fill="oklch(0.62 0.18 250 / 0.08)" />
          <path d="M0 110 C 80 120, 160 100, 240 140 S 400 200, 500 220 S 640 250, 700 250" stroke="rgba(20,22,26,0.20)" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
          <circle cx="500" cy="170" r="5" fill="oklch(0.62 0.18 250)" />
          <circle cx="500" cy="170" r="11" fill="oklch(0.62 0.18 250 / 0.20)" />
        </svg>

        {/* Cursor + tooltip */}
        <div style={{ position: 'absolute', left: '67%', top: '60%', pointerEvents: 'none' }}>
          <svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 2 L18 9 L11 11 L9 18 Z" fill="#15171A" stroke="#fff" strokeWidth="1.4"/></svg>
          <div style={{
            marginTop: 6, padding: '6px 10px',
            background: '#15171A', color: '#fff',
            borderRadius: 8, fontSize: 11, fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.20)',
          }}>Click "Export → CSV"</div>
        </div>
      </div>
    </div>
  );
}

function TerminalSurface() {
  const lines = [
    { p: '$', t: 'curl -s "https://mixpanel.com/api/2.0/cohorts/list" -u $TOKEN' },
    { p: '', t: '{ "cohorts": 47, "filtered": 12 }', dim: true },
    { p: '$', t: 'jq \'.cohorts[] | select(.created_after=="2026-04-01")\'' },
    { p: '', t: '12 cohorts matched', dim: true, ok: true },
  ];
  return (
    <div style={{ height: '100%', background: '#15171A', borderRadius: 14, padding: 20, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#E4E2DC', overflow: 'auto' }} className="scroll">
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '3px 0' }}>
          <span style={{ color: l.p ? 'oklch(0.62 0.18 250)' : 'transparent', width: 10 }}>{l.p}</span>
          <span style={{ color: l.dim ? '#A8AAB1' : l.ok ? 'oklch(0.65 0.16 145)' : '#E4E2DC' }}>{l.t}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, padding: '3px 0' }}>
        <span style={{ color: 'oklch(0.62 0.18 250)' }}>$</span>
        <span style={{ width: 8, height: 14, background: '#E4E2DC', display: 'inline-block', animation: 'hd-pulse 1s steps(2) infinite' }} />
      </div>
    </div>
  );
}

function PreviewSurface() {
  return (
    <div style={{ height: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 28, overflow: 'auto' }} className="scroll">
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>q2-churn.csv · 12 rows</div>
      <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {['cohort','signups','wk4_active','churn_rate','tier'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody style={{ fontFamily: 'var(--font-mono)' }}>
          {[
            ['2026-04-01', 248, 192, '22.6%', 'pro'],
            ['2026-04-08', 267, 211, '20.9%', 'pro'],
            ['2026-04-15', 192, 138, '28.1%', 'starter'],
            ['2026-04-22', 311, 246, '20.9%', 'pro'],
            ['2026-04-29', 220, 158, '28.2%', 'starter'],
          ].map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {r.map((c, j) => <td key={j} style={{ padding: '8px 12px', color: j === 0 ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* RIGHT INSPECTOR                                             */
/* ──────────────────────────────────────────────────────────── */
function RightInspector() {
  return (
    <div style={{ borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '14px 24px 12px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>Inspector</div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>step 4 / 7</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', gap: 24 }} className="scroll">
        {/* Current tool call */}
        <Block title="Current tool call">
          <ToolCall />
        </Block>

        {/* Approvals */}
        <Block title="Approvals" badge={<span style={{ fontSize: 10, fontWeight: 600, color: 'oklch(0.50 0.16 80)', background: 'oklch(0.78 0.16 80 / 0.16)', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.04em' }}>2</span>}>
          <ApprovalRow text="Send email to Dani Park" sub="Gmail · scoped" />
          <ApprovalRow text="Write to handle-data" sub="Memory · 1 fact" />
        </Block>

        {/* Memory used */}
        <Block title="Memory used">
          <MemUsed icon="P" label="Tier definitions" sub="3 facts · confidence 94%" color="oklch(0.60 0.15 320)" />
          <MemUsed icon="K" label="Mixpanel project ID" sub="1 fact · confidence 100%" color="oklch(0.60 0.14 200)" />
          <MemUsed icon="D" label="Dani Park · email" sub="1 fact · confidence 100%" color="oklch(0.62 0.18 250)" />
        </Block>

        {/* Files touched */}
        <Block title="Files touched">
          <FileTouched name="q2-churn.csv" sub="generating · 0 / 12 rows" state="active" />
          <FileTouched name="cohort-summary.md" sub="not started" state="pending" />
        </Block>

        {/* Sources */}
        <Block title="Sources">
          <SourceRow domain="mixpanel.com" sub="3 pages visited" />
          <SourceRow domain="kiwi.notion.site" sub="1 page · pricing tiers" />
        </Block>
      </div>
    </div>
  );
}

function Block({ title, badge, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</div>
        {badge}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function ToolCall() {
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: 'var(--bg-canvas)', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.62 0.18 250)' }} />
        <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>browser.click</span>
        <span style={{ flex: 1 }} />
        <span className="shimmer" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: '2px 6px', borderRadius: 3 }}>running</span>
      </div>
      <pre style={{ margin: 0, padding: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{`{
  "selector": "button[data-action='export']",
  "timeout_ms": 8000,
  "scroll_into_view": true
}`}</pre>
    </div>
  );
}

function ApprovalRow({ text, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'oklch(0.78 0.16 80 / 0.06)', border: '1px solid oklch(0.78 0.16 80 / 0.20)' }}>
      <I.Shield size={13} style={{ color: 'oklch(0.50 0.16 80)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>{text}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1 }}>{sub}</div>
      </div>
      <button style={{ height: 24, padding: '0 10px', borderRadius: 12, background: '#15171A', color: '#fff', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer' }}>Review</button>
    </div>
  );
}

function MemUsed({ icon, label, sub, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: color.replace(')', ' / 0.16)'), color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, letterSpacing: '-0.005em' }}>{label}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{sub}</div>
      </div>
    </div>
  );
}

function FileTouched({ name, sub, state }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <div style={{ width: 22, height: 22, borderRadius: 5, background: state === 'active' ? 'oklch(0.62 0.18 250 / 0.14)' : 'var(--bg-muted)', color: state === 'active' ? 'oklch(0.62 0.18 250)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <I.Folder size={11} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: state === 'pending' ? 'var(--text-tertiary)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      {state === 'active' && <Dots />}
    </div>
  );
}

function SourceRow({ domain, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <div style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <I.Globe size={11} style={{ color: 'var(--text-tertiary)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{sub}</div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* BOTTOM COMPOSER                                             */
/* ──────────────────────────────────────────────────────────── */
function BottomComposer() {
  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid var(--border-subtle)',
      padding: '14px 24px',
      background: 'var(--bg-surface)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-canvas)',
        borderRadius: 14,
        padding: '4px 6px 4px 16px',
        border: '1px solid var(--border-subtle)',
      }}>
        <I.Sparkles size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 13, color: 'var(--text-tertiary)', letterSpacing: '-0.005em', padding: '8px 0' }}>
          Add an instruction mid-task — Handle will weave it in.
        </div>
        <button style={iconBtn}><I.Attach size={13} /></button>
        <button style={iconBtn}><I.Mic size={13} /></button>
        <button style={{
          width: 34, height: 34, borderRadius: 17,
          background: '#15171A', color: '#fff',
          border: 'none', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><I.ArrowUp size={14} /></button>
      </div>
    </div>
  );
}

window.ScreenWorkspaceV2 = ScreenWorkspaceV2;
