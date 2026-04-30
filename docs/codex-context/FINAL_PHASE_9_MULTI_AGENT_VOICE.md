# Handle — Phase 9: Multi-Agent + Voice (FINAL)

Read FINAL_AGENTS.md, FINAL_KICKOFF.md, FINAL_DESIGN_SYSTEM.md,
FINAL_ROADMAP.md, and Phase 1-8 SIGNOFFs before starting.

==================================================
GOAL
==================================================

Add two distinct capabilities:

1. Multi-agent collaboration: a Supervisor agent delegates to
   named specialist agents (Researcher, Coder, Designer, Operator,
   Writer). Implemented via LangGraph.

2. Voice: input via OpenAI Whisper, output via OpenAI TTS. Voice
   approval flow.

Phase 9 ships in 3-4 weeks.

==================================================
SCOPE
==================================================

In scope:

Multi-agent:
- LangGraph supervisor pattern
- 5 specialist agents:
  - Researcher (browser-heavy, web research)
  - Coder (shell + file tools, code generation)
  - Designer (limited tools, focuses on visual deliverables)
  - Operator (browser-heavy, multi-step web tasks)
  - Writer (text generation, light tools)
- Per-specialist system prompt + tool subset + suggested model
- UI: pick specialist or "auto" (supervisor routes)
- LangSmith tracing for multi-agent

Voice:
- Whisper API for speech-to-text (push-to-talk)
- OpenAI TTS for text-to-speech (read responses aloud)
- Voice toggle in Settings
- Voice approval flow (verbal "approve"/"deny")
- Mic button in Composer

Out of scope:
- Continuous voice (always-listening) — push-to-talk only
- Voice cloning / custom voices
- Real-time streaming voice (response after agent done is OK)

==================================================
LANGGRAPH SUPERVISOR
==================================================

apps/api/src/agent/supervisor.ts:

```typescript
import { StateGraph, START, END, MessagesAnnotation } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { providerRegistry } from '../providers/registry';
import { researcherAgent, coderAgent, designerAgent, operatorAgent, writerAgent } from './specialists';

const SUPERVISOR_SYSTEM_PROMPT = `
You are the Supervisor in a multi-agent system. Your job is to route
the user's task to the most appropriate specialist agent.

Specialists:
- researcher: Web research, fact-finding, summarization of public info
- coder: Writing or modifying code, running scripts, technical tasks
- designer: Visual deliverables, design feedback, layout decisions
- operator: Multi-step web automation, complex browser tasks
- writer: Long-form text generation, drafting documents

Reply with JSON: { "next": "<specialist-id>" | "FINISH", "reason": "..." }

If the work is complete, reply with { "next": "FINISH", "reason": "..." }.
`;

export async function createSupervisor() {
  const { model } = await providerRegistry.getActiveModel();
  
  async function supervisorNode(state: typeof MessagesAnnotation.State) {
    const response = await model.invoke([
      { role: 'system', content: SUPERVISOR_SYSTEM_PROMPT },
      ...state.messages,
    ]);
    
    try {
      const parsed = JSON.parse(response.content as string);
      return { messages: [new AIMessage({ content: response.content as string, name: 'supervisor' })] };
    } catch {
      return { messages: [new AIMessage({ content: '{ "next": "FINISH", "reason": "Could not parse" }' })] };
    }
  }
  
  function routeFromSupervisor(state: typeof MessagesAnnotation.State): string {
    const lastMessage = state.messages[state.messages.length - 1];
    try {
      const parsed = JSON.parse(lastMessage.content as string);
      if (parsed.next === 'FINISH') return END;
      return parsed.next;
    } catch {
      return END;
    }
  }
  
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('supervisor', supervisorNode)
    .addNode('researcher', researcherAgent)
    .addNode('coder', coderAgent)
    .addNode('designer', designerAgent)
    .addNode('operator', operatorAgent)
    .addNode('writer', writerAgent)
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', routeFromSupervisor, {
      researcher: 'researcher',
      coder: 'coder',
      designer: 'designer',
      operator: 'operator',
      writer: 'writer',
      [END]: END,
    })
    .addEdge('researcher', 'supervisor')
    .addEdge('coder', 'supervisor')
    .addEdge('designer', 'supervisor')
    .addEdge('operator', 'supervisor')
    .addEdge('writer', 'supervisor');
  
  return workflow.compile();
}
```

==================================================
SPECIALIST AGENTS
==================================================

apps/api/src/agent/specialists/researcher.ts:

```typescript
import { providerRegistry } from '../../providers/registry';
import { createBrowserTools } from '../browserTools';
import { createMemoryTools } from '../memoryTools';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createOpenAIToolsAgent, AgentExecutor } from 'langchain/agents';

const RESEARCHER_PROMPT = `
You are the Researcher specialist. Your job is web research and
fact-finding. Use browser tools to navigate, extract text, and
gather information from authoritative sources.

Always:
- Cite sources for every fact
- Prefer official sources (company blogs, peer-reviewed papers,
  government sites) over aggregators
- Note when sources conflict
- Return findings in structured Markdown
`;

export async function researcherAgent(state: any) {
  const { model } = await providerRegistry.getActiveModel('anthropic');  // Prefer Claude for research
  const tools = [...createBrowserTools(state.ctx, state.browser), ...createMemoryTools(state.ctx)];
  
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', RESEARCHER_PROMPT],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}'],
  ]);
  
  const agent = await createOpenAIToolsAgent({ llm: model, tools, prompt });
  const executor = new AgentExecutor({ agent, tools, maxIterations: 15 });
  
  const result = await executor.invoke({ input: state.messages[state.messages.length - 1].content });
  
  return {
    messages: [{ role: 'assistant', content: result.output, name: 'researcher' }],
  };
}
```

Coder, Designer, Operator, Writer follow the same pattern with
different prompts and tool subsets:

| Specialist | Prompt focus | Tools | Suggested model |
|---|---|---|---|
| researcher | Web research, citations | browser, memory | Claude Opus |
| coder | Code, technical tasks | shell, file, github | GPT-4o or Claude Sonnet |
| designer | Visual feedback, layout | file (read), memory | GPT-4o |
| operator | Multi-step web tasks | browser, computer_use, integrations | Claude Opus |
| writer | Long-form prose | memory, file (write) | Claude Sonnet |

==================================================
SPECIALIST UI
==================================================

In the Composer, add a specialist picker:

```tsx
<select value={specialist} onChange={(e) => setSpecialist(e.target.value)}>
  <option value="auto">Auto (Supervisor routes)</option>
  <option value="researcher">Researcher</option>
  <option value="coder">Coder</option>
  <option value="designer">Designer</option>
  <option value="operator">Operator</option>
  <option value="writer">Writer</option>
</select>
```

Or a more elegant pill row with avatars per the design system.
Each specialist has a letter avatar (R/C/D/O/W) in a unique color.

When specialist === 'auto', the agent runs through the LangGraph
supervisor. When specialist === 'researcher' (etc.), it runs that
specialist directly without the supervisor loop.

In the Workspace status bar, show "Active: Researcher" pill.

==================================================
LANGSMITH TRACING
==================================================

LangChain has LangSmith integration baked in. Set:

```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=handle
```

LangGraph traces are automatic. View at
https://smith.langchain.com.

==================================================
VOICE INPUT (WHISPER)
==================================================

apps/api/src/voice/whisper.ts:

```typescript
import OpenAI from 'openai';
import fs from 'node:fs';
import { Readable } from 'node:stream';

const openai = new OpenAI();

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const tempPath = `/tmp/handle-audio-${Date.now()}.webm`;
  fs.writeFileSync(tempPath, audioBuffer);
  
  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
    });
    return response.text;
  } finally {
    fs.unlinkSync(tempPath);
  }
}
```

API endpoint: POST /api/voice/transcribe (multipart upload).

Frontend: Use MediaRecorder API to record, send to backend.

apps/web/components/workspace/MicButton.tsx:

```tsx
'use client';
import { useState, useRef } from 'react';
import { Mic, Square } from 'lucide-react';

export function MicButton({ onTranscription }: { onTranscription: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      
      const res = await fetch('/api/voice/transcribe', { method: 'POST', body: formData });
      const { text } = await res.json();
      onTranscription(text);
      
      stream.getTracks().forEach((t) => t.stop());
    };
    
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <button
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={stopRecording}
      className={`p-2 rounded-md transition-colors ${recording ? 'bg-status-error text-white' : 'text-text-tertiary hover:bg-bg-subtle'}`}
    >
      {recording ? <Square size={16} /> : <Mic size={16} />}
    </button>
  );
}
```

==================================================
VOICE OUTPUT (OPENAI TTS)
==================================================

apps/api/src/voice/tts.ts:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

export async function textToSpeech(text: string, voice = 'alloy'): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice,
    input: text,
  });
  return Buffer.from(await response.arrayBuffer());
}
```

API endpoint: POST /api/voice/tts → returns audio/mpeg.

Frontend plays automatically when Settings → Voice → Read aloud
is enabled. After agent emits final message, frontend fetches TTS
and plays.

```tsx
useEffect(() => {
  if (!readAloud || !finalMessage) return;
  
  fetch('/api/voice/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: finalMessage }),
  })
    .then((r) => r.blob())
    .then((blob) => {
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play();
    });
}, [finalMessage, readAloud]);
```

==================================================
VOICE APPROVAL FLOW
==================================================

When an approval is required and the user has voice enabled, the
approval modal also plays a TTS prompt: "Approval needed: [reason].
Say 'approve' or 'deny'."

A microphone listens for response. Use Whisper for transcription.
If transcription contains "approve" → approve. If "deny" or
"no" → deny.

This is optional UX; click-to-approve still works.

==================================================
SETTINGS → VOICE TAB
==================================================

apps/web/components/settings/VoiceSettings.tsx:

- Voice input toggle (default off — Whisper costs)
- Voice output toggle (default off)
- TTS voice picker (alloy, echo, fable, onyx, nova, shimmer)
- Read aloud after responses (toggle)
- Verbal approval (toggle)
- Test voice button (plays "Hello, I'm Handle.")

==================================================
TESTS
==================================================

1. Supervisor LangGraph compiles
2. Each specialist runs with mocked LLM
3. routeFromSupervisor parses output correctly
4. Whisper transcription with mocked OpenAI client
5. TTS with mocked OpenAI client
6. Voice settings persist
7. MicButton starts/stops MediaRecorder

==================================================
GATE CRITERIA
==================================================

1. All Phase 1-8 tests pass
2. Phase 9 tests pass 3 consecutive CI runs
3. User picks "Researcher" specialist, runs research task
4. User picks "Auto", supervisor routes to correct specialist
5. Voice input works (push-to-talk, transcribed correctly)
6. Voice output works (response read aloud)
7. Verbal approval works
8. SIGNOFF document

==================================================
MANUAL AUDIT
==================================================

scripts/manual-audit/phase9-multi-agent-voice.md:

Section A: Specialists
1. Composer → specialist: Researcher
2. Submit: "Research Stripe's pricing"
3. Verify researcher prompt active, browser tools used,
   citations included
4. Repeat for Coder ("Write a Python script to ..."), Operator
   ("Book a flight from SFO to LAX"), etc.

Section B: Auto routing
1. Composer → specialist: Auto
2. Submit: "Research Anthropic's funding history"
3. Verify Supervisor routes to Researcher
4. Submit: "Write a TypeScript function to debounce"
5. Verify Supervisor routes to Coder

Section C: Voice input
1. Settings → Voice → enable voice input
2. Composer → click and hold mic
3. Speak: "Tell me a joke"
4. Release, verify text appears in composer

Section D: Voice output
1. Settings → Voice → enable read aloud
2. Submit: "Tell me a joke"
3. Verify response played as audio

Section E: Verbal approval
1. Settings → Voice → enable verbal approval
2. Submit: "Send an email to test@example.com"
3. Verify approval modal shows + TTS plays prompt
4. Speak: "approve"
5. Verify approval registered

==================================================
IMPLEMENTATION ORDER
==================================================

1. LangGraph dependency + setup
2. Specialist prompts and definitions
3. Each specialist agent (5 files)
4. Supervisor with routing
5. Specialist UI in composer
6. Specialist pill in status bar
7. Whisper transcription endpoint + client
8. TTS endpoint + client
9. MicButton component
10. Read aloud effect in WorkspacePage
11. Verbal approval flow
12. Voice settings tab
13. Tests
14. Manual audit
15. SIGNOFF

==================================================
END OF PHASE 9 SPEC
==================================================
