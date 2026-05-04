import type { ParsedSkillMarkdownSection } from "./types";

const REQUIRED_HEADINGS = [
  "Overview",
  "Activation",
  "Inputs",
  "Workflow",
  "Tools",
  "Safety",
  "Artifacts",
  "Citations",
  "Evaluation",
];

export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdownSection[] {
  const sections: ParsedSkillMarkdownSection[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let current: ParsedSkillMarkdownSection | null = null;

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) {
      if (current) sections.push(trimSection(current));
      current = { content: "", title: match[1].trim() };
      continue;
    }
    if (current) {
      current.content += `${line}\n`;
    }
  }
  if (current) sections.push(trimSection(current));
  return sections;
}

export function validateSkillMarkdown(markdown: string) {
  const sections = parseSkillMarkdown(markdown);
  const present = new Set(sections.map((section) => section.title.toLowerCase()));
  const missing = REQUIRED_HEADINGS.filter((heading) => !present.has(heading.toLowerCase()));
  return { missing, sections, valid: missing.length === 0 };
}

function trimSection(section: ParsedSkillMarkdownSection) {
  return {
    ...section,
    content: section.content.trim(),
  };
}
