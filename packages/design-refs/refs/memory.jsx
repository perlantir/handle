/* global React, I, AppShellV2, TopbarV2 */

function ScreenMemoryV2() {
  return (
    <AppShellV2 active="memory">
      <TopbarV2
        title="Memory"
        right={<>
          <div style={{ position: 'relative' }}>
            <I.Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}/>
            <input placeholder="Search facts, entities…" style={{ width: 280, height: 34, padding: '0 14px 0 32px', borderRadius: 17, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none' }} />
          </div>
          <button style={{ height: 34, padding: '0 14px', borderRadius: 17, background: '#15171A', color: '#fff', fontSize: 12.5, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <I.Plus size={12} /> Add fact
          </button>
        </>}
      />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 320px', overflow: 'hidden' }}>
        {/* Facets */}
        <div style={{ padding: '8px 0 32px 32px', overflowY: 'auto' }} className="scroll">
          <Facet title="Kind" items={[
            { label: 'Person', count: 142, color: 'oklch(0.62 0.18 250)' },
            { label: 'Company', count: 38, color: 'oklch(0.60 0.14 200)' },
            { label: 'Project', count: 22, color: 'oklch(0.60 0.15 320)' },
            { label: 'Decision', count: 67, color: 'oklch(0.55 0.16 145)' },
            { label: 'Preference', count: 15, color: 'oklch(0.78 0.16 80)' },
          ]} />
          <Facet title="Source" items={[
            { label: 'Conversation', count: 218 },
            { label: 'Slack', count: 42 },
            { label: 'Linear', count: 14 },
            { label: 'Manual', count: 10 },
          ]} />
        </div>

        {/* Graph */}
        <div style={{ padding: '0 16px', position: 'relative' }}>
          <Graph />
        </div>

        {/* Detail */}
        <div style={{ padding: '8px 32px 32px 16px', overflowY: 'auto' }} className="scroll">
          <EntityDetail />
        </div>
      </div>
    </AppShellV2>
  );
}

function Facet({ title, items }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10, padding: '0 12px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map(it => (
          <div key={it.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            height: 30, padding: '0 12px',
            borderRadius: 8,
            fontSize: 12.5, color: 'var(--text-primary)',
            cursor: 'pointer',
          }}>
            {it.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color }} />}
            <span style={{ flex: 1 }}>{it.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{it.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Graph() {
  const nodes = [
    { id: 'rae', x: 380, y: 320, r: 28, label: 'Rae', kind: 'person', primary: true },
    { id: 'kiwi', x: 200, y: 200, r: 22, label: 'Kiwi', kind: 'company' },
    { id: 'handle', x: 580, y: 220, r: 22, label: 'Handle', kind: 'project' },
    { id: 'dani', x: 240, y: 460, r: 18, label: 'Dani', kind: 'person' },
    { id: 'theo', x: 540, y: 480, r: 18, label: 'Theo', kind: 'person' },
    { id: 'launch', x: 700, y: 360, r: 16, label: 'Launch', kind: 'decision' },
    { id: 'pricing', x: 100, y: 360, r: 16, label: 'Pricing', kind: 'decision' },
    { id: 'darkmode', x: 380, y: 540, r: 14, label: 'Dark mode', kind: 'preference' },
  ];
  const edges = [
    ['rae','kiwi'], ['rae','handle'], ['rae','dani'], ['rae','theo'], ['rae','darkmode'],
    ['handle','launch'], ['kiwi','pricing'], ['dani','handle'], ['theo','handle'],
  ];
  const colors = {
    person: 'oklch(0.62 0.18 250)',
    company: 'oklch(0.60 0.14 200)',
    project: 'oklch(0.60 0.15 320)',
    decision: 'oklch(0.55 0.16 145)',
    preference: 'oklch(0.78 0.16 80)',
  };
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  return (
    <svg width="100%" height="100%" viewBox="0 0 800 660" style={{ display: 'block' }}>
      <defs>
        <radialGradient id="bg-fade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(20,22,26,0.02)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="800" height="660" fill="url(#bg-fade)" />
      {edges.map(([a,b], i) => {
        const A = byId[a], B = byId[b];
        return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(20,22,26,0.10)" strokeWidth="1" />;
      })}
      {nodes.map(n => (
        <g key={n.id}>
          {n.primary && <circle cx={n.x} cy={n.y} r={n.r + 8} fill={colors[n.kind].replace(')', ' / 0.10)')} />}
          <circle cx={n.x} cy={n.y} r={n.r} fill={colors[n.kind].replace(')', ' / 0.18)')} stroke={colors[n.kind]} strokeWidth={n.primary ? 2 : 1.2} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={n.primary ? 12 : 11} fontWeight="500" fill="#15171A" letterSpacing="-0.01em">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}

function EntityDetail() {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Project · selected</div>
      <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', margin: '6px 0 16px' }}>Handle</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Fact label="Mission" value="AI workspace that operates on Rae's behalf" confidence={0.94} />
        <Fact label="Status" value="Pre-launch · waitlist 1,420" confidence={0.88} />
        <Fact label="Team" value="Rae, Dani, Theo" confidence={1.0} />
        <Fact label="Launch" value="Q3 2026" confidence={0.62} muted />
      </div>

      <div style={{ marginTop: 26, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>Recent updates</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Update text="Pricing model decided · Apr 24" />
        <Update text="Onboarding rewrite started · Apr 22" />
        <Update text="Theo joined as design lead · Apr 18" />
      </div>
    </div>
  );
}

function Fact({ label, value, confidence, muted }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>{label}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(confidence * 100)}%</span>
      </div>
      <div style={{ fontSize: 13, color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)', letterSpacing: '-0.005em' }}>{value}</div>
      <div style={{ height: 2, background: 'var(--bg-muted)', borderRadius: 1, marginTop: 6, overflow: 'hidden' }}>
        <div style={{ width: `${confidence * 100}%`, height: '100%', background: confidence > 0.8 ? 'oklch(0.55 0.16 145)' : confidence > 0.5 ? 'oklch(0.78 0.16 80)' : 'oklch(0.60 0.20 25)' }} />
      </div>
    </div>
  );
}
function Update({ text }) {
  return <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>{text}</div>;
}

window.ScreenMemoryV2 = ScreenMemoryV2;
