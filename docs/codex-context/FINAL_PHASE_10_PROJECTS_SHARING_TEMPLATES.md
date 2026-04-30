# Handle — Phase 10: Projects + History + Sharing + Templates (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1-9 SIGNOFFs before starting.

==================================================
GOAL
==================================================

Add four organizational features that make Handle usable for
ongoing work:

1. Projects — group tasks with a master instruction
2. History — full task list with search and resume
3. Sharing — make tasks public via read-only links
4. Templates — save tasks as reusable templates

Phase 10 ships in 2 weeks.

==================================================
SCOPE
==================================================

In scope:
- Project entity + master instruction
- Project switcher in sidebar
- Tasks list (Screen 02)
- Search across history
- Task resume (continue conversation)
- Task export (markdown)
- Public sharing with read-only link
- Task templates

Out of scope:
- Team / multi-user projects (Phase 12+)
- Project-level permissions (single-user)
- Template marketplace (Phase 12+)

==================================================
SCHEMA UPDATES
==================================================

```prisma
model Project {
  id                  String    @id @default(cuid())
  userId              String
  name                String
  masterInstruction   String?   @db.Text  // Markdown, applied to all tasks in project
  isDefault           Boolean   @default(false)
  createdAt           DateTime  @default(now())
  user                User      @relation(fields: [userId], references: [id])
  tasks               Task[]
}

model Task {
  // ... existing ...
  projectId           String?
  project             Project?  @relation(fields: [projectId], references: [id])
  title               String?   // Auto-generated or user-set
  isShared            Boolean   @default(false)
  shareSlug           String?   @unique  // For /share/[slug] URLs
  shareCloneable      Boolean   @default(false)
  
  @@index([projectId])
  @@index([shareSlug])
}

model Template {
  id              String    @id @default(cuid())
  userId          String
  name            String
  description     String?
  goal            String    @db.Text
  skillId         String?
  backend         String    @default("e2b")
  specialistId    String?
  createdAt       DateTime  @default(now())
}
```

Migration creates default project for each existing user with
isDefault=true. Existing tasks reassigned to default project.

==================================================
PROJECTS
==================================================

apps/api/src/routes/projects.ts:

```
GET    /api/projects                 List user's projects
POST   /api/projects                  Create new project
GET    /api/projects/:id              Get project + recent tasks
PUT    /api/projects/:id              Update name / masterInstruction
DELETE /api/projects/:id              Delete (must reassign tasks first)
POST   /api/projects/:id/default      Set as default
```

Project switcher in sidebar (top of sidebar, above nav items):

```tsx
<ProjectSwitcher>
  <ProjectAvatar project={current} />
  <span>{current.name}</span>
  <ChevronDown />
</ProjectSwitcher>
```

Click opens dropdown of projects + "New project" + "Manage projects".

When a task is created, it's tagged with the current project. The
project's masterInstruction is prepended to the system prompt:

```typescript
const project = await prisma.project.findUnique({ where: { id: task.projectId } });
const systemPrompt = `
${BASE_SYSTEM_PROMPT}

${project?.masterInstruction ? `<project_master_instruction>\n${project.masterInstruction}\n</project_master_instruction>` : ''}
`;
```

==================================================
TASKS LIST (SCREEN 02)
==================================================

apps/web/app/(workspace)/tasks/page.tsx:

Anatomy per Screen 02 design:
- TopBar: Search input + Filter button + New task button
- Tabs: Active (count) / Waiting (count) / Completed (count) / All (count)
- Table:
  - Status dot (running pulse for active)
  - Task (title + sub-line of goal first 80 chars)
  - Source (project name pill)
  - Started (relative time)
  - Cost (running total via LangSmith)
  - Status pill (Running / Waiting / Completed / Error)
  - More menu (open, share, save as template, delete)

```tsx
<Table>
  {tasks.map((task) => (
    <TableRow key={task.id} onClick={() => router.push(`/tasks/${task.id}`)}>
      <StatusDot status={task.status.toLowerCase()} pulsing={task.status === 'RUNNING'} />
      <div>
        <div className="font-medium text-sm">{task.title || task.goal.slice(0, 60)}</div>
        <div className="text-xs text-text-tertiary">{task.goal.slice(0, 80)}</div>
      </div>
      <div>{task.project?.name}</div>
      <div>{relativeTime(task.createdAt)}</div>
      <div>${task.cost?.toFixed(2)}</div>
      <StatusPill status={task.status} />
      <MoreMenu task={task} />
    </TableRow>
  ))}
</Table>
```

Search:
- Frontend search box debounced 300ms
- Backend full-text search across goal + title + messages.content
- Postgres tsvector index for performance

==================================================
TASK RESUME
==================================================

A completed task can be resumed by sending another message. The
existing task ID stays the same; a new agent run kicks off with
the full conversation history.

```typescript
// POST /api/tasks/:id/resume { message: '...' }
async function resumeTask(taskId: string, userMessage: string) {
  // Append user message
  await prisma.message.create({
    data: { taskId, role: 'USER', content: userMessage },
  });
  
  // Pull all prior messages
  const messages = await prisma.message.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });
  
  // Convert to LangChain format
  const chatHistory = messages.slice(0, -1).map((m) => ({
    role: m.role.toLowerCase(),
    content: m.content ?? '',
  }));
  
  // Re-run agent with chat history
  await runAgent(taskId, userMessage, chatHistory);
}
```

In the Workspace, the bottom composer remains active even after
task is STOPPED. Sending a message resumes the task.

==================================================
TASK EXPORT
==================================================

Export task as Markdown:

```typescript
// GET /api/tasks/:id/export
function formatTaskAsMarkdown(task: TaskWithMessages): string {
  let md = `# ${task.title || 'Task'}\n\n`;
  md += `**Goal:** ${task.goal}\n\n`;
  md += `**Status:** ${task.status} | **Created:** ${task.createdAt}\n\n---\n\n`;
  
  for (const message of task.messages) {
    if (message.role === 'USER') md += `## User\n\n${message.content}\n\n`;
    if (message.role === 'ASSISTANT') md += `## Assistant\n\n${message.content}\n\n`;
    // Tool calls / results omitted for readability
  }
  
  return md;
}
```

Frontend: button in task more-menu → "Export as Markdown" →
downloads file.

==================================================
SHARING
==================================================

A task can be made public via a read-only link. The link is
unguessable (cuid) and accessible without auth.

```
POST   /api/tasks/:id/share       { cloneable: boolean } → returns shareSlug
DELETE /api/tasks/:id/share       Unshare
GET    /share/:slug               Public view (no auth)
POST   /share/:slug/clone         Clone task (auth required)
```

apps/web/app/share/[slug]/page.tsx:

```tsx
export default async function SharedTaskPage({ params }: { params: { slug: string } }) {
  const task = await fetchSharedTask(params.slug);
  if (!task) return <NotFound />;
  
  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <Banner>
        <span>Shared by Handle user</span>
        {task.shareCloneable && <CloneButton slug={params.slug} />}
      </Banner>
      <h1>{task.title}</h1>
      <p className="text-text-secondary">{task.goal}</p>
      <div className="mt-8">
        {task.messages.map((m) => (
          <Message key={m.id} message={m} readonly />
        ))}
      </div>
    </div>
  );
}
```

Clone:
- User must be signed in
- POST /share/:slug/clone creates a new task in user's default
  project with same goal and same messages copied as history
- Returns new task ID, redirect to /tasks/:id

==================================================
TEMPLATES
==================================================

A user can save a task as a template. Templates are accessible
in /templates and from the Composer's "Use template" button.

```
GET    /api/templates                 List user's templates
POST   /api/templates                  Create from task
GET    /api/templates/:id              Get template
PUT    /api/templates/:id              Update
DELETE /api/templates/:id              Delete
POST   /api/templates/:id/instantiate  Create new task from template
```

apps/web/app/(workspace)/templates/page.tsx:

Grid of TemplateCard components similar to SkillCard. Each card:
- Letter avatar
- Name + description
- "Used N times" caption
- Use button → instantiates and opens new task

==================================================
HOME SCREEN UPDATES
==================================================

Update the Home screen's Continue band (Screen 01) to actually
pull from real recent tasks instead of placeholder data:

```tsx
// apps/web/components/home/ContinueBand.tsx
export async function ContinueBand() {
  const recent = await fetchRecentTasks(3);  // Server component or hook
  if (!recent.length) return null;
  
  return (
    <section>
      <h2 className="caption">Continue where you left off</h2>
      <div className="grid grid-cols-3 gap-4 mt-4">
        {recent.map((task) => <ContinueCard key={task.id} task={task} />)}
      </div>
    </section>
  );
}
```

==================================================
TESTS
==================================================

1. Project CRUD
2. Default project creation on user signup
3. Master instruction injected into agent prompt
4. Task resume preserves history
5. Task export produces markdown
6. Sharing creates slug, public URL accessible
7. Cloning creates new task with copied history
8. Templates instantiation creates new task

==================================================
GATE CRITERIA
==================================================

1. All Phase 1-9 tests pass
2. Phase 10 tests pass 3 consecutive CI runs
3. User creates two projects, runs tasks in each
4. Master instruction applied per project
5. /tasks list shows all tasks with search working
6. Resume completed task continues conversation
7. Sharing produces a public link, viewable in incognito
8. Clone creates new task in user's default project
9. Template save + instantiate works
10. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase10-projects-sharing-templates.md:

Section A: Projects
1. Create "Personal" project, master: "I'm a software engineer."
2. Create "Family" project, master: "I have two kids, ages 5 and 8."
3. Switch to Personal, submit "What time should I sleep?"
4. Verify response references being a software engineer
5. Switch to Family, submit same goal
6. Verify response references parenting context

Section B: Tasks list + search
1. /tasks → verify list shows all tasks
2. Type "sleep" in search → verify matching task shown
3. Click row → opens that task

Section C: Resume
1. Open a completed task
2. Type new message in composer
3. Verify task resumes, agent considers prior context

Section D: Sharing
1. More menu → Share → toggle on
2. Copy link
3. Open in incognito → verify task loads without auth
4. Sign in with another account, click Clone
5. Verify new task in default project

Section E: Templates
1. More menu → Save as template
2. /templates → verify card
3. Click Use → verify new task with same goal

==================================================
IMPLEMENTATION ORDER
==================================================

1. Schema migration (Project, Template, Task additions)
2. Default project creation
3. Project API
4. Project switcher UI
5. Master instruction injection
6. Tasks list page (Screen 02)
7. Search functionality
8. Task resume
9. Task export
10. Sharing API + public route
11. Cloning
12. Templates API
13. Templates page
14. Update Home Continue band to use real data
15. Tests
16. Manual audit
17. SIGNOFF

==================================================
END OF PHASE 10 SPEC
==================================================
