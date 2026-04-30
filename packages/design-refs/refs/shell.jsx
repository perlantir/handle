/* global React, I */
// Handle v2 shell — much more whitespace, softer chrome, pill controls.

const SHELL_W = 1440;
const SHELL_H = 900;

function SidebarV2({ active = 'home' }) {
  const item = (key, IconC, label, badge) => {
    const isActive = active === key;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        height: 34, padding: '0 14px', margin: '0 10px',
        borderRadius: 10,
        fontSize: 13.5, fontWeight: isActive ? 500 : 400,
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: isActive ? 'rgba(20,22,26,0.05)' : 'transparent',
        cursor: 'pointer', letterSpacing: '-0.005em',
      }}>
        {IconC && <IconC size={16} style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)', flexShrink: 0 }} />}
        <span style={{ flex: 1 }}>{label}</span>
        {badge != null && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{badge}</span>}
      </div>
    );
  };

  return (
    <aside style={{
      width: 244, flexShrink: 0,
      background: 'var(--bg-canvas)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 0,
    }}>
      {/* Brand — extra top padding to clear macOS traffic lights */}
      <div style={{ padding: '52px 24px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8,
          background: 'oklch(0.62 0.18 250)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 2.5v9M3.5 7h7M10.5 2.5v9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>Handle</span>
      </div>

      {/* New chat — pill, secondary */}
      <div style={{ padding: '0 16px 16px' }}>
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          height: 38, padding: '0 14px',
          borderRadius: 10,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)',
          cursor: 'pointer', letterSpacing: '-0.005em',
        }}>
          <I.Plus size={15} style={{ color: 'var(--text-tertiary)' }} />
          New task
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>⌘K</span>
        </button>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }} className="scroll">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {item('home', I.Home, 'Home')}
          {item('tasks', I.Tasks, 'Tasks', 12)}
          {item('workspace', I.Workspace, 'Workspace')}
          {item('schedules', I.Calendar, 'Schedules')}
          {item('artifacts', I.Folder, 'Artifacts')}
        </div>

        <div style={{ height: 18 }} />

        <div style={{ padding: '0 24px 8px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>Knowledge</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {item('memory', I.Memory, 'Memory')}
          {item('skills', I.Skills, 'Skills')}
          {item('integrations', I.Plug, 'Integrations')}
        </div>

        <div style={{ height: 18 }} />

        <div style={{ padding: '0 24px 8px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>Pinned</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {item('p1', null, 'Q3 competitive scan')}
          {item('p2', null, 'Pricing model v4')}
          {item('p3', null, 'Onboarding rewrite')}
        </div>
      </nav>

      {/* Bottom: upgrade pill */}
      <div style={{ padding: '12px 16px 18px' }}>
        <button style={{
          width: '100%', height: 44, borderRadius: 22,
          background: '#15171A', color: '#fff',
          fontSize: 13.5, fontWeight: 500, letterSpacing: '-0.005em',
          border: 'none', cursor: 'pointer',
        }}>Upgrade to Pro</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 6px 0' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'oklch(0.62 0.18 250)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>R</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>Rae Chen</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>1,420 credits</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopbarV2({ title, right }) {
  return (
    <header style={{
      height: 56, flexShrink: 0,
      marginTop: 32,
      display: 'flex', alignItems: 'center',
      padding: '0 32px', gap: 12,
    }}>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div>
    </header>
  );
}

function MacChromeV2() {
  return (
    <div style={{
      position: 'absolute', top: 16, left: 20, zIndex: 5,
      display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
    </div>
  );
}

function AppShellV2({ active, children }) {
  return (
    <div style={{
      width: SHELL_W, height: SHELL_H,
      background: 'var(--bg-surface)',
      display: 'flex',
      position: 'relative',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-primary)',
      overflow: 'hidden',
    }}>
      <MacChromeV2 />
      <SidebarV2 active={active} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-surface)' }}>
        {children}
      </div>
    </div>
  );
}

// Pill button
function PillBtn({ children, primary, ghost, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      height: 36, padding: '0 16px', borderRadius: 18,
      fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
      background: primary ? 'var(--text-primary)' : ghost ? 'transparent' : 'var(--bg-surface)',
      color: primary ? '#fff' : 'var(--text-primary)',
      border: ghost ? 'none' : `1px solid ${primary ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
      cursor: 'pointer',
      ...style,
    }}>{children}</button>
  );
}

function ComposerV2({ placeholder = 'Ask Handle anything…', large = true }) {
  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 18,
        padding: '20px 22px 14px',
      }}>
        <div style={{
          fontSize: large ? 15 : 14, lineHeight: 1.5,
          color: 'var(--text-tertiary)',
          minHeight: large ? 44 : 32,
          letterSpacing: '-0.005em',
        }}>{placeholder}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <button style={{ width: 32, height: 32, borderRadius: 16, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <I.Attach size={14} />
          </button>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 16, background: 'transparent', border: '1px solid var(--border-subtle)', fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <I.Sparkles size={13} /> Plan
          </button>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 16, background: 'transparent', border: '1px solid var(--border-subtle)', fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <I.Globe size={13} /> Research
          </button>
          <span style={{ flex: 1 }} />
          <button style={{ width: 32, height: 32, borderRadius: 16, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <I.Mic size={15} />
          </button>
          <button style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--text-primary)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <I.ArrowUp size={15} stroke={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AppShellV2, SidebarV2, TopbarV2, MacChromeV2, ComposerV2, PillBtn, SHELL_W, SHELL_H });
