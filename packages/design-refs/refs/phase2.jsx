/* global React, I, AppShellV2 */
// Phase 2 screens — Onboarding, Tasks list, Skills, Schedules, Integrations, Settings.
// Compact: shared file to keep the project tidy.

const muted = 'var(--text-muted)';
const tertiary = 'var(--text-tertiary)';
const secondary = 'var(--text-secondary)';
const primary = 'var(--text-primary)';
const subtleBorder = '1px solid var(--border-subtle)';

const sectionLabel = {
  fontSize: 11, color: muted, fontWeight: 500,
  letterSpacing: '0.04em', textTransform: 'uppercase',
};

function Topbar({ title, right }) {
  return (
    <header style={{
      height: 56, marginTop: 32, flexShrink: 0,
      borderBottom: subtleBorder,
      display: 'flex', alignItems: 'center',
      padding: '0 32px', gap: 12,
    }}>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: primary, letterSpacing: '-0.01em' }}>{title}</div>
      {right}
    </header>
  );
}

const pillBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  height: 34, padding: '0 14px',
  borderRadius: 17, fontSize: 12.5, fontWeight: 500,
  letterSpacing: '-0.005em', cursor: 'pointer',
};
const pillSecondary = { ...pillBtn, background: 'var(--bg-surface)', border: subtleBorder, color: primary };
const pillDark = { ...pillBtn, background: '#15171A', border: 'none', color: '#fff' };
const pillGhost = { ...pillBtn, background: 'transparent', border: 'none', color: secondary };

/* ═══════════════════════════════════════════════════════════ */
/* 01 · ONBOARDING — provider setup                            */
/* ═══════════════════════════════════════════════════════════ */
function ScreenOnboarding() {
  return (
    <div style={{
      width: 1440, height: 900, fontFamily: 'var(--font-sans)',
      background: 'var(--bg-surface)', color: primary,
      display: 'flex', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 16, left: 20, display: 'flex', gap: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }}/>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }}/>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }}/>
      </div>

      {/* Left rail — step list */}
      <aside style={{ width: 280, padding: '64px 0 32px 32px', borderRight: subtleBorder, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px 32px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'oklch(0.62 0.18 250)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 2.5v9M3.5 7h7M10.5 2.5v9" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>Handle</span>
        </div>

        <div style={{ ...sectionLabel, padding: '0 24px 12px' }}>Get set up</div>
        <div>
          {[
            { n: 1, label: 'Welcome', state: 'done' },
            { n: 2, label: 'Choose a model', state: 'done' },
            { n: 3, label: 'Connect tools', state: 'active' },
            { n: 4, label: 'Memory seeds', state: 'pending' },
            { n: 5, label: 'First task', state: 'pending' },
          ].map(s => (
            <div key={s.n} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 24px',
              background: s.state === 'active' ? 'rgba(20,22,26,0.04)' : 'transparent',
            }}>
              <StepCircle state={s.state} n={s.n} />
              <span style={{
                fontSize: 13,
                color: s.state === 'pending' ? tertiary : primary,
                fontWeight: s.state === 'active' ? 500 : 400,
                letterSpacing: '-0.005em',
              }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: muted }}>
          <I.Lock size={11} /> All keys stored locally, encrypted.
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '64px 80px 40px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 8, fontSize: 11, color: muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Step 3 of 5</div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 500, letterSpacing: '-0.025em', fontFamily: 'var(--font-display)' }}>Connect the tools Handle can use</h1>
        <p style={{ margin: '10px 0 0', fontSize: 14.5, color: secondary, lineHeight: 1.55, maxWidth: 580, letterSpacing: '-0.005em' }}>
          Pick what Handle should be able to read and act on. You can scope each connection — and revoke them at any time.
        </p>

        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 880 }}>
          <ProviderCard color="oklch(0.55 0.16 145)" letter="G" name="Gmail" sub="Read & send mail" connected />
          <ProviderCard color="oklch(0.62 0.18 250)" letter="L" name="Linear" sub="Issues & projects" connected />
          <ProviderCard color="#15171A" letter="N" name="Notion" sub="Read & write pages" />
          <ProviderCard color="oklch(0.55 0.10 285)" letter="S" name="Slack" sub="Read messages & DMs" />
          <ProviderCard color="oklch(0.78 0.16 80)" letter="M" name="Mixpanel" sub="Read analytics" connected />
          <ProviderCard color="oklch(0.60 0.20 25)" letter="F" name="Figma" sub="Read files & comments" />
          <ProviderCard color="oklch(0.60 0.14 200)" letter="G" name="GitHub" sub="Repos, PRs, actions" />
          <ProviderCard color="oklch(0.60 0.15 320)" letter="C" name="Calendar" sub="Read events" />
          <ProviderCard color={tertiary} letter="+" name="Add custom MCP" sub="paste server URL" muted />
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={pillGhost}>Skip for now</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: tertiary }}>3 of 9 connected</span>
          <button style={pillSecondary}>Back</button>
          <button style={pillDark}>Continue <I.ArrowRight size={12} /></button>
        </div>
      </main>
    </div>
  );
}

function StepCircle({ state, n }) {
  if (state === 'done') return (
    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'oklch(0.55 0.16 145)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2 5.5l2.5 2.5L9 3" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );
  if (state === 'active') return (
    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#15171A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{n}</div>
  );
  return <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--border-default)', color: tertiary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{n}</div>;
}

function ProviderCard({ color, letter, name, sub, connected, muted: m }) {
  return (
    <div style={{
      padding: 20, borderRadius: 14,
      border: subtleBorder,
      background: 'var(--bg-surface)',
      display: 'flex', flexDirection: 'column', gap: 14,
      minHeight: 130,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: m ? 'var(--bg-canvas)' : color,
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 600,
          border: m ? '1px dashed var(--border-default)' : 'none',
          ...(m ? { color: tertiary } : null),
        }}>{letter}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: m ? secondary : primary, letterSpacing: '-0.005em' }}>{name}</div>
          <div style={{ fontSize: 11.5, color: tertiary, marginTop: 2 }}>{sub}</div>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      {connected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'oklch(0.55 0.16 145)', fontWeight: 500 }}>
          <I.Check size={11} /> Connected
        </div>
      ) : (
        <button style={{ ...pillSecondary, height: 30, padding: '0 12px', fontSize: 12 }}>Connect</button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* 02 · TASKS LIST                                             */
/* ═══════════════════════════════════════════════════════════ */
function ScreenTasks() {
  return (
    <AppShellV2 active="tasks">
      <Topbar title="Tasks" right={<>
        <div style={{ position: 'relative' }}>
          <I.Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: tertiary }}/>
          <input placeholder="Search tasks…" style={{ width: 260, height: 34, padding: '0 14px 0 32px', borderRadius: 17, border: subtleBorder, background: 'var(--bg-surface)', fontSize: 12.5, outline: 'none' }} />
        </div>
        <button style={pillSecondary}><I.Filter size={12} /> Filter</button>
        <button style={pillDark}><I.Plus size={12} /> New task</button>
      </>} />

      <div style={{ flex: 1, padding: '24px 32px 32px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {['Active · 4', 'Waiting · 2', 'Completed · 38', 'All'].map((l, i) => (
            <button key={l} style={{
              height: 30, padding: '0 14px', borderRadius: 15,
              fontSize: 12.5, fontWeight: 500,
              background: i === 0 ? 'var(--bg-surface)' : 'transparent',
              border: i === 0 ? subtleBorder : '1px solid transparent',
              color: i === 0 ? primary : tertiary,
              cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px 140px 140px 100px 80px', gap: 16, padding: '0 16px 8px', ...sectionLabel }}>
          <span></span>
          <span>Task</span>
          <span>Source</span>
          <span>Started</span>
          <span>Cost</span>
          <span>Status</span>
          <span></span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }} className="scroll">
          {tasksData.map((t, i) => <TaskRow key={i} {...t} />)}
        </div>
      </div>
    </AppShellV2>
  );
}

const tasksData = [
  { state: 'running', title: 'Pull Q2 churn cohorts from Mixpanel', sub: 'Step 4 of 7 · Inspecting pricing page…', source: 'Mixpanel', started: '4 min ago', cost: '$0.18', status: 'Running' },
  { state: 'running', title: 'Refactor settings page in handle-web', sub: 'Writing tests · 12 of 18 passing', source: 'GitHub', started: '12 min ago', cost: '$0.42', status: 'Running' },
  { state: 'running', title: 'Daily morning brief', sub: 'Reading 23 unread Slack threads', source: 'Schedule', started: '8 min ago', cost: '$0.06', status: 'Running' },
  { state: 'running', title: 'Find 5 design partners for waitlist', sub: 'Searching LinkedIn for matches', source: 'Linear', started: '2 min ago', cost: '$0.04', status: 'Running' },
  { state: 'waiting', title: 'Send 14 emails to design partners', sub: 'Awaiting your approval to send', source: 'Gmail', started: '18 min ago', cost: '$0.22', status: 'Approval' },
  { state: 'waiting', title: 'Schedule kick-off with Theo', sub: 'Found 3 mutual slots — confirm?', source: 'Calendar', started: '32 min ago', cost: '$0.03', status: 'Question' },
];

function TaskRow({ state, title, sub, source, started, cost, status }) {
  const dotColor = {
    running: 'oklch(0.62 0.18 250)',
    waiting: 'oklch(0.78 0.16 80)',
    success: 'oklch(0.55 0.16 145)',
  }[state];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '24px 1fr 120px 140px 140px 100px 80px',
      gap: 16, padding: '14px 16px',
      borderRadius: 12,
      cursor: 'pointer',
      alignItems: 'center',
    }}>
      <div style={{ position: 'relative', width: 8, height: 8 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: dotColor }} />
        {state === 'running' && <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: dotColor, opacity: 0.20, animation: 'hd-pulse 1.6s ease-in-out infinite' }} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: primary, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: tertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
      <span style={{ fontSize: 12, color: secondary }}>{source}</span>
      <span style={{ fontSize: 12, color: tertiary }}>{started}</span>
      <span style={{ fontSize: 12, color: secondary, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{cost}</span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 11,
        background: state === 'waiting' ? 'oklch(0.78 0.16 80 / 0.16)' : 'oklch(0.62 0.18 250 / 0.10)',
        color: state === 'waiting' ? 'oklch(0.50 0.16 80)' : 'oklch(0.62 0.18 250)',
        fontSize: 11, fontWeight: 500, width: 'fit-content',
      }}>{status}</span>
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: tertiary, justifySelf: 'end' }}><I.More size={14} /></button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* 03 · SKILLS                                                 */
/* ═══════════════════════════════════════════════════════════ */
function ScreenSkills() {
  return (
    <AppShellV2 active="skills">
      <Topbar title="Skills" right={<>
        <button style={pillSecondary}><I.Folder size={12} /> Browse marketplace</button>
        <button style={pillDark}><I.Plus size={12} /> Create skill</button>
      </>} />

      <div style={{ flex: 1, padding: '24px 32px 32px', overflowY: 'auto' }} className="scroll">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Installed</h2>
          <span style={{ fontSize: 12, color: tertiary }}>14 skills · 3 updated this week</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SkillCard color="oklch(0.62 0.18 250)" letter="W" name="Weekly review" sub="Built by Rae" usage="Run 8× this week" />
          <SkillCard color="oklch(0.55 0.16 145)" letter="P" name="PR reviewer" sub="@handle / official" usage="Run 24× this week" verified />
          <SkillCard color="oklch(0.78 0.16 80)" letter="O" name="Outreach drafter" sub="Built by Dani" usage="Run 4× this week" />
          <SkillCard color="oklch(0.60 0.15 320)" letter="C" name="Customer call notes" sub="@handle / official" usage="Run 12× this week" verified />
          <SkillCard color="oklch(0.60 0.14 200)" letter="A" name="Analytics digest" sub="Built by Theo" usage="Idle 6 days" muted />
          <SkillCard color="oklch(0.55 0.10 285)" letter="L" name="Linear triage" sub="Community · 312 ★" usage="Run 2× this week" />
        </div>

        <div style={{ marginTop: 40, display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Recent runs</h2>
          <span style={{ fontSize: 12, color: tertiary }}>auditable per-skill activity</span>
        </div>

        <div style={{ background: 'var(--bg-surface)', borderRadius: 14, border: subtleBorder }}>
          {[
            { skill: 'PR reviewer', action: 'Reviewed PR #284 in handle-web', time: '12 min ago', cost: '$0.04', ok: true },
            { skill: 'Customer call notes', action: 'Summarized Loop call · 38 min', time: '1h ago', cost: '$0.08', ok: true },
            { skill: 'Outreach drafter', action: 'Drafted 14 emails', time: '2h ago', cost: '$0.22', flag: 'approval' },
            { skill: 'Weekly review', action: 'Generated weekly digest', time: 'Mon 9:00am', cost: '$0.16', ok: true },
            { skill: 'Linear triage', action: 'Routed 6 issues', time: 'yesterday', cost: '$0.05', ok: true },
          ].map((r, i, a) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 120px 80px 100px', gap: 16, padding: '14px 20px', alignItems: 'center', borderBottom: i < a.length - 1 ? subtleBorder : 'none' }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: primary }}>{r.skill}</span>
              <span style={{ fontSize: 12.5, color: secondary, letterSpacing: '-0.005em' }}>{r.action}</span>
              <span style={{ fontSize: 11.5, color: tertiary }}>{r.time}</span>
              <span style={{ fontSize: 11.5, color: tertiary, fontFamily: 'var(--font-mono)' }}>{r.cost}</span>
              {r.ok ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'oklch(0.55 0.16 145)' }}><I.Check size={11} /> ok</span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'oklch(0.50 0.16 80)' }}><I.Shield size={11} /> approved</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShellV2>
  );
}

function SkillCard({ color, letter, name, sub, usage, verified, muted: m }) {
  return (
    <div style={{ padding: 20, borderRadius: 14, border: subtleBorder, background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 600 }}>{letter}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-0.005em' }}>{name}</span>
            {verified && <I.CheckCircle size={11} style={{ color: 'oklch(0.62 0.18 250)' }} />}
          </div>
          <div style={{ fontSize: 11.5, color: tertiary, marginTop: 2 }}>{sub}</div>
        </div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: tertiary }}><I.More size={14} /></button>
      </div>
      <div style={{ fontSize: 11.5, color: m ? muted : tertiary, paddingTop: 4, borderTop: subtleBorder }}>{usage}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* 04 · SCHEDULES                                              */
/* ═══════════════════════════════════════════════════════════ */
function ScreenSchedules() {
  return (
    <AppShellV2 active="schedules">
      <Topbar title="Schedules" right={<>
        <button style={pillDark}><I.Plus size={12} /> New schedule</button>
      </>} />

      <div style={{ flex: 1, padding: '24px 32px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28 }} className="scroll">
        <div>
          <div style={{ ...sectionLabel, marginBottom: 14 }}>Today · 3 runs scheduled</div>
          <Timeline24 />
        </div>

        <div>
          <div style={{ ...sectionLabel, marginBottom: 14 }}>All schedules · 6</div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 14, border: subtleBorder }}>
            {[
              { name: 'Daily morning brief', cron: 'every weekday at 8:00am', last: 'today 8:00am', next: 'tomorrow 8:00am', state: 'on' },
              { name: 'Weekly review', cron: 'mondays at 9:00am', last: 'mon 9:00am', next: 'mon 9:00am', state: 'on' },
              { name: 'Inbox cleanup', cron: 'every 2h while online', last: '14 min ago', next: 'in 1h 46m', state: 'on' },
              { name: 'Quarterly retro', cron: 'first of quarter at 10am', last: 'apr 1', next: 'jul 1', state: 'on' },
              { name: 'Weekend digest', cron: 'saturdays at 10am', last: 'sat 10:00am', next: 'sat 10:00am', state: 'paused' },
              { name: 'Standup prep', cron: 'every weekday 9:55am', last: '— never run —', next: 'tomorrow 9:55am', state: 'on', isNew: true },
            ].map((s, i, a) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 200px 140px 140px 60px', gap: 14, padding: '16px 20px', alignItems: 'center', borderBottom: i < a.length - 1 ? subtleBorder : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.state === 'on' ? 'oklch(0.55 0.16 145)' : 'var(--text-muted)' }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-0.005em' }}>{s.name}</span>
                    {s.isNew && <span style={{ fontSize: 10, fontWeight: 600, color: 'oklch(0.62 0.18 250)', background: 'oklch(0.62 0.18 250 / 0.10)', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.04em' }}>NEW</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: tertiary, marginTop: 2, fontFamily: 'var(--font-mono)' }}>{s.cron}</div>
                </div>
                <span style={{ fontSize: 12, color: tertiary }}>last: {s.last}</span>
                <span style={{ fontSize: 12, color: secondary }}>next: {s.next}</span>
                <Toggle on={s.state === 'on'} />
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: tertiary, justifySelf: 'end' }}><I.More size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShellV2>
  );
}

function Timeline24() {
  // Hours 0..24, schedule pills positioned by hour
  const items = [
    { h: 8, w: 0.5, label: 'Daily brief', color: 'oklch(0.62 0.18 250)' },
    { h: 10, w: 0.4, label: 'Inbox cleanup', color: 'oklch(0.55 0.16 145)' },
    { h: 12, w: 0.4, label: 'Inbox cleanup', color: 'oklch(0.55 0.16 145)' },
    { h: 14, w: 0.4, label: 'Inbox cleanup', color: 'oklch(0.55 0.16 145)' },
    { h: 16, w: 0.4, label: 'Inbox cleanup', color: 'oklch(0.55 0.16 145)' },
  ];
  return (
    <div style={{ background: 'var(--bg-surface)', border: subtleBorder, borderRadius: 14, padding: 20 }}>
      <div style={{ position: 'relative', height: 70 }}>
        {/* Hour ticks */}
        {[...Array(25)].map((_, h) => (
          <div key={h} style={{ position: 'absolute', left: `${(h/24)*100}%`, top: 18, bottom: 18, width: 1, background: h % 6 === 0 ? 'var(--border-default)' : 'var(--border-subtle)' }} />
        ))}
        {/* Now line */}
        <div style={{ position: 'absolute', left: '40%', top: 0, bottom: 0, width: 2, background: 'oklch(0.60 0.20 25)', zIndex: 2 }}>
          <div style={{ position: 'absolute', left: 4, top: -2, fontSize: 10, color: 'oklch(0.60 0.20 25)', fontWeight: 600, letterSpacing: '0.04em' }}>NOW · 9:36am</div>
        </div>
        {/* Schedule pills */}
        {items.map((it, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${(it.h/24)*100}%`, width: `${(it.w/24)*100}%`,
            top: 30, height: 24, borderRadius: 12,
            background: it.color, color: '#fff',
            display: 'flex', alignItems: 'center', padding: '0 10px',
            fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>{it.label}</div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: muted, fontFamily: 'var(--font-mono)' }}>
        {['00','06','12','18','24'].map(h => <span key={h}>{h}:00</span>)}
      </div>
    </div>
  );
}

function Toggle({ on }) {
  return (
    <span style={{
      width: 32, height: 18, borderRadius: 9,
      background: on ? 'var(--accent)' : 'var(--bg-muted)',
      position: 'relative', display: 'inline-block', flexShrink: 0,
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.10)', transition: 'left 180ms' }} />
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* 05 · INTEGRATIONS                                           */
/* ═══════════════════════════════════════════════════════════ */
function ScreenIntegrations() {
  return (
    <AppShellV2 active="integrations">
      <Topbar title="Integrations" right={<>
        <button style={pillSecondary}><I.Plus size={12} /> Add custom MCP</button>
      </>} />

      <div style={{ flex: 1, padding: '24px 32px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28 }} className="scroll">
        <div>
          <div style={{ ...sectionLabel, marginBottom: 14 }}>Connected · 4</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <IntegrationCard color="oklch(0.55 0.16 145)" letter="G" name="Gmail" account="rae@kiwi.co" scopes={['read','send']} status="ok" calls="412 calls · 7d" />
            <IntegrationCard color="oklch(0.62 0.18 250)" letter="L" name="Linear" account="kiwi-team" scopes={['issues:read','issues:write']} status="ok" calls="118 calls · 7d" />
            <IntegrationCard color="oklch(0.78 0.16 80)" letter="M" name="Mixpanel" account="project 2418301" scopes={['analytics:read']} status="ok" calls="44 calls · 7d" />
            <IntegrationCard color="oklch(0.60 0.14 200)" letter="G" name="GitHub" account="kiwi-co/handle-web" scopes={['repo','workflow']} status="needs-reauth" calls="8 calls · 7d" />
          </div>
        </div>

        <div>
          <div style={{ ...sectionLabel, marginBottom: 14 }}>Available</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <AvailableCard color="#15171A" letter="N" name="Notion" />
            <AvailableCard color="oklch(0.55 0.10 285)" letter="S" name="Slack" />
            <AvailableCard color="oklch(0.60 0.20 25)" letter="F" name="Figma" />
            <AvailableCard color="oklch(0.60 0.15 320)" letter="C" name="Calendar" />
            <AvailableCard color="oklch(0.50 0.18 250)" letter="J" name="Jira" />
            <AvailableCard color="oklch(0.55 0.16 145)" letter="S" name="Stripe" />
            <AvailableCard color="oklch(0.78 0.16 80)" letter="A" name="Airtable" />
            <AvailableCard color={tertiary} letter="+" name="Custom MCP" muted />
          </div>
        </div>
      </div>
    </AppShellV2>
  );
}

function IntegrationCard({ color, letter, name, account, scopes, status, calls }) {
  const ok = status === 'ok';
  return (
    <div style={{ padding: 20, borderRadius: 14, border: subtleBorder, background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 600 }}>{letter}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-0.005em' }}>{name}</div>
          <div style={{ fontSize: 11.5, color: tertiary, marginTop: 2, fontFamily: 'var(--font-mono)' }}>{account}</div>
        </div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: tertiary }}><I.More size={14} /></button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
        {scopes.map(s => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px', borderRadius: 11, background: 'var(--bg-canvas)', border: subtleBorder, fontSize: 10.5, color: secondary, fontFamily: 'var(--font-mono)' }}>{s}</span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, paddingTop: 14, borderTop: subtleBorder }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: ok ? 'oklch(0.55 0.16 145)' : 'oklch(0.60 0.20 25)', fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? 'oklch(0.55 0.16 145)' : 'oklch(0.60 0.20 25)' }} />
          {ok ? 'Healthy' : 'Needs reauth'}
        </span>
        <span style={{ fontSize: 11, color: tertiary }}>· {calls}</span>
      </div>
    </div>
  );
}

function AvailableCard({ color, letter, name, muted: m }) {
  return (
    <div style={{ padding: 16, borderRadius: 12, border: m ? '1px dashed var(--border-default)' : subtleBorder, background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: m ? 'var(--bg-canvas)' : color, color: m ? tertiary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600 }}>{letter}</div>
      <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.005em', color: m ? secondary : primary }}>{name}</div>
      <button style={{ ...pillSecondary, height: 26, padding: '0 12px', fontSize: 11.5 }}>Connect</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* 06 · SETTINGS                                               */
/* ═══════════════════════════════════════════════════════════ */
function ScreenSettings() {
  return (
    <AppShellV2 active="settings">
      <Topbar title="Settings" right={null} />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden', minHeight: 0 }}>
        <aside style={{ padding: '24px 0 32px 16px', borderRight: subtleBorder }}>
          {[
            ['Profile', true],
            ['Models & API keys'],
            ['Approvals & trust'],
            ['Memory'],
            ['Privacy'],
            ['Billing'],
            ['Keyboard'],
            ['Advanced'],
          ].map(([label, active]) => (
            <div key={label} style={{
              padding: '8px 16px', margin: '0 8px',
              fontSize: 12.5, borderRadius: 8,
              fontWeight: active ? 500 : 400,
              color: active ? primary : secondary,
              background: active ? 'rgba(20,22,26,0.05)' : 'transparent',
              cursor: 'pointer',
              letterSpacing: '-0.005em',
            }}>{label}</div>
          ))}
        </aside>

        <div style={{ padding: '32px 56px', overflowY: 'auto', maxWidth: 760 }} className="scroll">
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Profile</h2>

          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Field label="Name" value="Rae Chen" />
            <Field label="Email" value="rae@kiwi.co" muted />
            <Field label="Display name in messages" value="Rae" />

            <SectionDivider title="Defaults" />
            <Field label="Default model" value={<ModelChip />} />
            <Field label="Time zone" value="America/Los_Angeles · PT" />
            <Field label="Working hours" value="9:00am – 6:30pm" />

            <SectionDivider title="Behavior" />
            <ToggleField label="Voice mode" sub="Push-to-talk via ⌥-Space" on={true} />
            <ToggleField label="Read aloud responses" sub="Use system voice" on={false} />
            <ToggleField label="Show approval banner sound" sub="Soft chime when Handle needs you" on={true} />
          </div>
        </div>
      </div>
    </AppShellV2>
  );
}

function Field({ label, value, muted: m }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px', gap: 24, alignItems: 'center' }}>
      <span style={{ fontSize: 12.5, color: secondary, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: m ? tertiary : primary }}>{value}</span>
      <button style={{ ...pillGhost, fontSize: 12, justifySelf: 'end' }}>Edit</button>
    </div>
  );
}

function ToggleField({ label, sub, on }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 13, color: primary, fontWeight: 500, letterSpacing: '-0.005em' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: tertiary, marginTop: 2 }}>{sub}</div>
      </div>
      <Toggle on={on} />
    </div>
  );
}

function SectionDivider({ title }) {
  return (
    <div style={{ paddingTop: 18, marginTop: 8, borderTop: subtleBorder }}>
      <div style={{ ...sectionLabel, marginBottom: 8 }}>{title}</div>
    </div>
  );
}

function ModelChip() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 12px', borderRadius: 14, background: 'var(--bg-surface)', border: subtleBorder, fontSize: 12, color: primary, fontFamily: 'var(--font-mono)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.62 0.18 250)' }} />
      claude-4.5-sonnet
    </span>
  );
}

window.ScreenOnboarding = ScreenOnboarding;
window.ScreenTasks = ScreenTasks;
window.ScreenSkills = ScreenSkills;
window.ScreenSchedules = ScreenSchedules;
window.ScreenIntegrations = ScreenIntegrations;
window.ScreenSettings = ScreenSettings;
