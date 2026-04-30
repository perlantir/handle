/* global React, I, AppShellV2, TopbarV2 */

function ScreenApprovalV2() {
  return (
    <AppShellV2 active="tasks">
      <TopbarV2 title="Tasks" right={null} />

      {/* Dim overlay */}
      <div style={{ flex: 1, position: 'relative', background: 'var(--bg-canvas)' }}>
        {/* Background hint */}
        <div style={{ padding: '32px 64px', opacity: 0.35, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ height: 56, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
            ))}
          </div>
        </div>

        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,22,26,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{
            width: 540,
            background: 'var(--bg-surface)',
            borderRadius: 18,
            boxShadow: '0 24px 80px rgba(20,22,26,0.20), 0 8px 24px rgba(20,22,26,0.10)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '28px 32px 8px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 12, background: 'oklch(0.78 0.16 80 / 0.16)', color: 'oklch(0.50 0.16 80)', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}>
                <I.Shield size={11} /> NEEDS APPROVAL
              </div>
              <h2 style={{ margin: '14px 0 6px', fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Send 14 emails to design partners</h2>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Handle wants to send personalized outreach via your Gmail. Review the plan before continuing.
              </p>
            </div>

            <div style={{ padding: '20px 32px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>Plan</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <PlanRow risk="low" text="Read contact list from Linear · 14 people" />
                <PlanRow risk="low" text="Draft personalized email per contact" />
                <PlanRow risk="med" text="Send via Gmail (rae@kiwi.co)" highlighted />
                <PlanRow risk="low" text="Log responses to memory" />
              </div>
            </div>

            <div style={{ padding: '20px 32px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>Scope</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <ScopeChip>Gmail · send</ScopeChip>
                <ScopeChip>Linear · read</ScopeChip>
                <ScopeChip>Memory · write</ScopeChip>
              </div>
            </div>

            <div style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border-subtle)', marginTop: 20 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <span style={{ width: 32, height: 18, borderRadius: 9, background: 'var(--accent)', position: 'relative', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', right: 2, top: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
                </span>
                Trust similar runs
              </label>
              <span style={{ flex: 1 }} />
              <button style={{ height: 38, padding: '0 18px', borderRadius: 19, background: 'transparent', border: '1px solid var(--border-default)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer' }}>Decline</button>
              <button style={{ height: 38, padding: '0 22px', borderRadius: 19, background: '#15171A', color: '#fff', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>Approve & run</button>
            </div>
          </div>
        </div>
      </div>
    </AppShellV2>
  );
}

function PlanRow({ risk, text, highlighted }) {
  const colors = {
    low: 'oklch(0.55 0.16 145)',
    med: 'oklch(0.78 0.16 80)',
    high: 'oklch(0.60 0.20 25)',
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px',
      borderRadius: 10,
      background: highlighted ? 'oklch(0.78 0.16 80 / 0.08)' : 'transparent',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors[risk], flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>{text}</span>
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{risk}</span>
    </div>
  );
}

function ScopeChip({ children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{children}</span>
  );
}

window.ScreenApprovalV2 = ScreenApprovalV2;
