import type { SkillArtifactInput, SkillTraceStepInput } from "./types";

const TOPICS = [
  "Identity and official sources",
  "Products and services",
  "Leadership and history",
  "Recent news",
  "Market and competitors",
  "Operations and hiring signals",
];

export function wideResearchExpansion(subject: string): {
  artifacts: SkillArtifactInput[];
  steps: SkillTraceStepInput[];
} {
  return {
    artifacts: [
      {
        citations: TOPICS.map((topic) => ({
          coverage: topic,
          title: `${subject} ${topic}`,
          url: `https://example.com/wide-research/${encodeURIComponent(subject)}/${encodeURIComponent(topic)}`,
        })),
        inlineContent: JSON.stringify(
          {
            subject,
            topics: TOPICS.map((topic) => ({
              status: "queued-for-subtask",
              topic,
            })),
          },
          null,
          2,
        ),
        kind: "SOURCE_SET",
        mimeType: "application/json",
        title: "Wide research source map",
      },
    ],
    steps: TOPICS.map((topic, index) => ({
      metadata: { topic },
      safeSummary: `Prepared wide research subtask for ${topic.toLowerCase()}.`,
      title: `Wide research ${index + 1}: ${topic}`,
      toolName: "wide_research.subtask",
      type: "WORKFLOW",
    })),
  };
}
