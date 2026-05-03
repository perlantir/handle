# Phase 4 Manual Audit -- Projects + Local Execution

**Auditor: User (Nick). Codex does not run this.**

## Pre-Audit Setup

1. Verify branch is `phase-4/local-execution` and CI is green.
2. Pull latest: `git pull && pnpm install`.
3. Verify ports are clean: `lsof -i :3000`, `lsof -i :3001`; kill any LISTEN processes.
4. Start backend: `pnpm --filter @handle/api dev`.
5. Start frontend: `pnpm --filter @handle/web dev`.
6. Open `http://127.0.0.1:3000` in Chrome.
7. Confirm the primary provider is Anthropic for browser/computer-use sections.

## Section A: Project Container + Default Workspace Scope

1. In the sidebar, confirm the default project **Personal** exists.
2. Create a new project from the sidebar and select it.
3. In the composer, set scope to **Default workspace** and backend to **Local**.

Submit:

```text
Write a Python script that prints the first 10 prime numbers and run it.
```

Verify:

- [ ] Backend pill shows **Local**.
- [ ] Workspace dir exists at `~/Documents/Handle/workspaces/<project-id>/`.
- [ ] `script.py` exists in that project workspace on the user's actual Mac.
- [ ] `shell_exec` runs `python3` on the user's actual Mac, not in a sandbox.
- [ ] Agent reads output and returns the 10 prime numbers.
- [ ] `~/Library/Logs/Handle/audit.log` has entries with `projectId`, `scope: "DEFAULT_WORKSPACE"`, and actions `file_write`, `file_read`, `shell_exec`.
- [ ] Audit log entries for workspace-internal actions have `decision: "allow"`.

## Section B: Custom Folder Scope

1. Create a folder: `~/Desktop/handle-custom-scope-audit`.
2. In Settings -> Defaults or the composer scope control, set the active project scope to **Custom folder**.
3. Set custom folder path to `~/Desktop/handle-custom-scope-audit`.

Submit:

```text
Create notes.txt in the project folder with the text custom scope works.
```

Verify:

- [ ] No approval modal appears.
- [ ] File exists at `~/Desktop/handle-custom-scope-audit/notes.txt`.
- [ ] `audit.log` has `scope: "CUSTOM_FOLDER"` and `decision: "allow"`.

Submit:

```text
Write hello to ~/Desktop/outside-custom-scope.txt
```

Verify:

- [ ] Approval modal appears because the target is outside the custom folder scope.
- [ ] Click **Deny**.
- [ ] Agent reports denial gracefully.
- [ ] Delete `~/Desktop/handle-custom-scope-audit` after audit.

## Section C: Full Access Scope + Forbidden Patterns

1. Set the active project scope to **Full access**.

Submit:

```text
Write 'hello' to ~/Desktop/handle-full-access-test.txt
```

Verify:

- [ ] No approval modal appears.
- [ ] File exists on Desktop.
- [ ] `audit.log` has `scope: "FULL_ACCESS"` and `decision: "allow"`.
- [ ] Delete the Desktop test file manually after verification.

Submit:

```text
Write 'test' to /System/test.txt
```

Verify:

- [ ] Approval modal does not appear.
- [ ] Agent receives a clean deny error.
- [ ] `audit.log` has `decision: "deny"` and `matchedPattern` includes `/System`.

## Section D: Shell Safety Edge Cases

Submit:

```text
Run sudo apt update
```

Verify:

- [ ] Denied before approval.
- [ ] `audit.log` shows `decision: "deny"` and `matchedPattern` includes `sudo`.

Submit:

```text
Run echo hello > ~/Desktop/handle-redirection-test.txt
```

Verify:

- [ ] Approval modal appears because shell redirection targets outside scope.
- [ ] Click **Deny**.
- [ ] File is not created.

Submit:

```text
In the project workspace, run cd into the workspace and execute python3 script.py using a command chain.
```

Verify:

- [ ] Workspace-internal chain runs without approval.
- [ ] `audit.log` entry has `decision: "allow"`.

## Section E: Rate Limiting

Submit:

```text
Run echo hello 50 times in rapid succession using a bash loop, like for i in {1..50}; do echo $i; done
```

Verify:

- [ ] This is treated as a single shell command.
- [ ] Rate limit does not trigger.

Submit:

```text
Use shell_exec to run 50 separate echo commands, one per call, as fast as possible.
```

Verify:

- [ ] Rate limit fires around the 11th call.
- [ ] Agent reports rate limit error gracefully.
- [ ] `audit.log` shows roughly 10 allow entries before rate limit takes over.

## Section F: Multi-Turn Conversation

1. Start a new conversation in the active project.

Submit:

```text
Create a file named animal.txt with the word otter.
```

Then reply in the same conversation:

```text
Now read the file you just created and tell me the word.
```

Verify:

- [ ] Second run has prior conversation context.
- [ ] Agent reads the existing file without being told the path again.
- [ ] Chat thread shows both user turns and both assistant responses.
- [ ] The follow-up run links to the same project/conversation.

## Section G: Model Switching

1. Pick Anthropic in the model selector.
2. Submit a small task.
3. Pick OpenAI or OpenRouter in the model selector.
4. Submit a follow-up message in the same conversation.

Verify:

- [ ] First run uses the first selected provider/model.
- [ ] Second run uses the second selected provider/model.
- [ ] Workspace header reflects the provider/model for the active run.
- [ ] Conversation history remains intact across the model switch.

## Section H: Project Switching + Isolation

1. Create two projects: **Audit A** and **Audit B**.
2. Set **Audit A** to default workspace scope.
3. Set **Audit B** to custom folder scope pointing at a different folder.
4. In **Audit A**, create `project.txt` with `A`.
5. Switch to **Audit B**, create `project.txt` with `B`.

Verify:

- [ ] Files land in different scope roots.
- [ ] Sidebar project switching loads the selected project.
- [ ] Audit log entries include the correct `projectId`.
- [ ] Agent cannot accidentally read **Audit A** files while in **Audit B** without approval.

## Section I: Local Browser -- Separate Profile

1. Set browser mode to **Separate profile** in Settings -> Browser.
2. Use Local backend.

Submit:

```text
Go to https://news.ycombinator.com and tell me the first headline.
```

Verify:

- [ ] A separate Chrome window opens on the Mac.
- [ ] Workspace UI shows the screenshot.
- [ ] Agent returns a real headline.
- [ ] Window stays separate from normal Chrome with no shared cookies/history.

## Section J: Local Browser -- Actual Chrome

1. Quit normal Chrome with Cmd+Q.
2. Start Chrome:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 &
```

3. In Settings -> Browser, choose **Use my actual Chrome**.
4. Click **Test connection**.

Verify:

- [ ] Connection reports connected.

Submit:

```text
Tell me what tabs I currently have open.
```

Verify:

- [ ] Heightened approval modal appears with tabs/sessions/passwords/history warnings.
- [ ] **Approve** is disabled until **I understand** is checked.
- [ ] `audit.log` has `action: "browser_use_actual_chrome"`.
- [ ] Agent reports actual open tabs accurately.
- [ ] Quit Chrome after the section.

## Section K: Regression -- Prior Phases Still Work

Submit Phase 1 canonical task with E2B backend:

```text
Python script for HN top 10
```

Verify:

- [ ] PASS.

Submit Phase 3 computer-use task with E2B backend and Anthropic provider:

```text
Take screenshot of E2B desktop
```

Verify:

- [ ] PASS.

Submit Phase 3 browser-tools task with E2B backend:

```text
Navigate to HN, get first headline
```

Verify:

- [ ] PASS.

## Failure Handling

If anything fails, write findings in:

- `docs/phase-4/AUDIT_FINDINGS.md`

One section per finding:

- Reproduction steps
- Expected result
- Actual result
- Severity: P0 (blocks ship), P1 (must fix), P2 (post-ship polish)

## After All Sections Pass

Write SIGNOFF at `docs/phase-4/SIGNOFF.md` using the Phase 3 SIGNOFF template adapted for Phase 4:

- Summary of what shipped
- CI run links, including three consecutive green runs
- Audit results, with this checklist all checked
- Known deferrals with rationale
- Phase 11 backlog additions for non-blocking findings
