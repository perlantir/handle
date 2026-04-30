/* global React, I, AppShellV2, TopbarV2 */

function ScreenResearchV2() {
  return (
    <AppShellV2 active="tasks">
      <TopbarV2
        title="Map the AI agent landscape · 18 sources"
        right={<>
          <button style={{ height: 32, padding: '0 14px', borderRadius: 16, border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <I.Download size={12} /> Export
          </button>
          <button style={{ height: 32, padding: '0 14px', borderRadius: 16, background: '#15171A', color: '#fff', fontSize: 12.5, border: 'none', cursor: 'pointer' }}>Share</button>
        </>}
      />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 280px', overflow: 'hidden' }}>
        {/* Tree */}
        <div style={{ padding: '8px 8px 32px 32px', overflowY: 'auto' }} className="scroll">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0 12px 14px' }}>Plan</div>
          <Tree />
        </div>

        {/* Report */}
        <div style={{ padding: '0 56px 40px', overflowY: 'auto' }} className="scroll">
          <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Report draft · v3</div>
            <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.025em', margin: '8px 0 4px', fontFamily: 'var(--font-display)' }}>The agent layer is consolidating around three primitives</h1>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>4 min read · updated just now</div>

            <div style={{ marginTop: 28, fontSize: 14.5, lineHeight: 1.7, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>
              <p style={{ margin: '0 0 16px' }}>Across 18 product launches in the last six months, three capabilities show up repeatedly: <strong>browser operation</strong>, <strong>persistent memory</strong>, and <strong>scoped skill execution</strong>.<Cite n={3} /></p>
              <p style={{ margin: '0 0 16px' }}>The market has bifurcated. One camp ships horizontal "do anything" agents focused on screen and keyboard control;<Cite n={5} /> the other ships vertical agents pre-loaded with domain memory and tool access.<Cite n={11} /></p>

              <h2 style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.015em', margin: '32px 0 12px' }}>Three patterns worth watching</h2>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                <li style={{ marginBottom: 12 }}>Skill markets are quietly emerging.<Cite n={7} /> Anthropic's Skills primitive and OpenAI's GPT Store both reward composable, scoped capabilities over monoliths.</li>
                <li style={{ marginBottom: 12 }}>Memory has graduated from RAG to typed graphs.<Cite n={9} /> Three of the top six products now ship a memory inspector.</li>
                <li>Approval flows are the new pricing surface.<Cite n={14} /> Per-action review is being repackaged as "trust tiers."</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Sources */}
        <div style={{ padding: '8px 32px 32px 16px', overflowY: 'auto' }} className="scroll">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 14 }}>Sources · 18</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Source n={3} domain="a16z.com" title="The agent stack, mid-2026" />
            <Source n={5} domain="latent.space" title="What 'computer use' shipped" />
            <Source n={7} domain="anthropic.com" title="Skills: a primitive for agents" />
            <Source n={9} domain="every.to" title="Why memory graphs won" />
            <Source n={11} domain="benn.substack.com" title="Vertical wins again" />
            <Source n={14} domain="stratechery.com" title="The trust-tier business model" />
          </div>
        </div>
      </div>
    </AppShellV2>
  );
}

function Tree() {
  const items = [
    { d: 0, label: 'Map AI agent landscape', state: 'active' },
    { d: 1, label: 'Define category', state: 'done' },
    { d: 1, label: 'Survey 50 products', state: 'done' },
    { d: 2, label: 'Horizontal · 14 found', state: 'done' },
    { d: 2, label: 'Vertical · 22 found', state: 'done' },
    { d: 1, label: 'Identify patterns', state: 'active' },
    { d: 2, label: 'Skill markets', state: 'done' },
    { d: 2, label: 'Memory inspectors', state: 'active' },
    { d: 2, label: 'Approval flows', state: 'pending' },
    { d: 1, label: 'Synthesize report', state: 'pending' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {items.map((it, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 12px',
          paddingLeft: 12 + it.d * 16,
          borderRadius: 8,
          fontSize: 12.5,
          color: it.state === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)',
          fontWeight: it.state === 'active' ? 500 : 400,
          letterSpacing: '-0.005em',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: it.state === 'done' ? 'oklch(0.55 0.16 145)' : it.state === 'active' ? 'oklch(0.62 0.18 250)' : 'transparent',
            border: it.state === 'pending' ? '1px solid var(--border-default)' : 'none',
            flexShrink: 0,
          }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}

function Cite({ n }) {
  return (
    <sup style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 16, padding: '0 4px',
      borderRadius: 4, marginLeft: 3,
      background: 'var(--accent-soft)',
      color: 'var(--accent)',
      fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      cursor: 'pointer', verticalAlign: 'baseline',
    }}>{n}</sup>
  );
}

function Source({ n, domain, title }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{domain}</div>
      </div>
    </div>
  );
}

window.ScreenResearchV2 = ScreenResearchV2;
