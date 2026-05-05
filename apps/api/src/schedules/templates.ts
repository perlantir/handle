import type { ScheduleTemplateSummary } from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { serializeTemplate } from "./serializer";

type ScheduleStore = typeof prisma;

const BUILT_IN_TEMPLATES = [
  {
    category: "Research",
    description: "Research the top news and source-backed changes for a topic every morning.",
    inputDefaults: { company: "Anthropic", depth: "standard" },
    name: "Daily News Digest",
    policyDefaults: { notifyOnChange: true, testModeActions: "draft_only" },
    requiredConnectors: [],
    scheduleDefaults: { cronExpression: "0 8 * * 1-5", timezone: "America/Chicago" },
    slug: "daily-news-digest",
    targetRef: { skillSlug: "research-company" },
    targetType: "WIDE_RESEARCH",
  },
  {
    category: "Research",
    description: "Track competitors weekly and produce a source set plus executive comparison.",
    inputDefaults: { company: "Anthropic", depth: "deep", focusAreas: ["market", "competitors"] },
    name: "Weekly Competitor Tracking",
    policyDefaults: { changeDetection: { enabled: true, mode: "notify_on_change" } },
    requiredConnectors: [],
    scheduleDefaults: { cronExpression: "0 9 * * 1", timezone: "America/Chicago" },
    slug: "weekly-competitor-tracking",
    targetRef: { skillSlug: "research-company" },
    targetType: "WIDE_RESEARCH",
  },
  {
    category: "Operations",
    description: "Summarize the pipeline and blockers at the start of each week.",
    inputDefaults: { goal: "Review current project status, blockers, and next actions." },
    name: "Monday Pipeline Review",
    policyDefaults: { approval: "ask_for_external_writes" },
    requiredConnectors: ["linear"],
    scheduleDefaults: { cronExpression: "0 9 * * 1", timezone: "America/Chicago" },
    slug: "monday-pipeline-review",
    targetRef: { goal: "Prepare a Monday pipeline review." },
    targetType: "TASK",
  },
  {
    category: "Email",
    description: "Triage unread email, extract action items, and draft a concise summary.",
    inputDefaults: { goal: "Summarize unread important email and draft follow-ups for approval." },
    name: "Daily Inbox Triage",
    policyDefaults: { externalSend: "draft_only" },
    requiredConnectors: ["gmail"],
    scheduleDefaults: { cronExpression: "30 8 * * 1-5", timezone: "America/Chicago" },
    slug: "daily-inbox-triage",
    targetRef: { goal: "Run daily inbox triage." },
    targetType: "TASK",
  },
  {
    category: "Knowledge",
    description: "Summarize active Notion workspaces with key themes and action items.",
    inputDefaults: { depth: "standard", workspace: "current" },
    name: "Weekly Notion Project Summary",
    policyDefaults: {},
    requiredConnectors: ["notion"],
    scheduleDefaults: { cronExpression: "0 15 * * 5", timezone: "America/Chicago" },
    slug: "weekly-notion-project-summary",
    targetRef: { skillSlug: "summarize-a-notion-workspace" },
    targetType: "SKILL",
  },
  {
    category: "Engineering",
    description: "Review open pull requests and flag risky changes before standup.",
    inputDefaults: { mode: "summary" },
    name: "GitHub PR Review Reminder",
    policyDefaults: {},
    requiredConnectors: ["github"],
    scheduleDefaults: { cronExpression: "0 10 * * 1-5", timezone: "America/Chicago" },
    slug: "github-pr-review-reminder",
    targetRef: { skillSlug: "code-review-a-pr" },
    targetType: "SKILL",
  },
  {
    category: "Release",
    description: "Draft release notes from merged PRs and project updates.",
    inputDefaults: { goal: "Draft release notes from recent merged PRs and notable project changes." },
    name: "Release Notes Draft",
    policyDefaults: { externalWrites: "approval_required" },
    requiredConnectors: ["github", "slack"],
    scheduleDefaults: { cronExpression: "0 14 * * 5", timezone: "America/Chicago" },
    slug: "release-notes-draft",
    targetRef: { goal: "Create a release notes draft." },
    targetType: "TASK",
  },
  {
    category: "Travel",
    description: "Monitor travel options and notify only when better recommendations appear.",
    inputDefaults: { destination: "Tokyo", travelers: 1 },
    name: "Travel Price Watch",
    policyDefaults: { changeDetection: { enabled: true, threshold: "material_change" } },
    requiredConnectors: [],
    scheduleDefaults: { cronExpression: "0 18 * * *", timezone: "America/Chicago" },
    slug: "travel-price-watch",
    targetRef: { skillSlug: "plan-a-trip" },
    targetType: "SKILL",
  },
  {
    category: "Calendar",
    description: "Prepare a meeting brief from calendar, email, and known project context.",
    inputDefaults: { goal: "Prepare a calendar prep brief for tomorrow's meetings." },
    name: "Calendar Prep Brief",
    policyDefaults: {},
    requiredConnectors: ["google_calendar"],
    scheduleDefaults: { cronExpression: "0 17 * * 1-5", timezone: "America/Chicago" },
    slug: "calendar-prep-brief",
    targetRef: { goal: "Prepare tomorrow's calendar brief." },
    targetType: "TASK",
  },
  {
    category: "Files",
    description: "Summarize changed Google Drive files in a folder.",
    inputDefaults: { folder: "recent" },
    name: "Drive Folder Digest",
    policyDefaults: { changeDetection: { enabled: true } },
    requiredConnectors: ["google_drive"],
    scheduleDefaults: { cronExpression: "0 16 * * 5", timezone: "America/Chicago" },
    slug: "drive-folder-digest",
    targetRef: { goal: "Summarize recently changed Drive files." },
    targetType: "TASK",
  },
  {
    category: "Infrastructure",
    description: "Check Cloudflare and Vercel health and report risky deployment or DNS changes.",
    inputDefaults: { goal: "Check Cloudflare Pages and Vercel deployment health." },
    name: "Cloudflare and Vercel Health Watch",
    policyDefaults: { forbiddenWrites: true },
    requiredConnectors: ["cloudflare", "vercel"],
    scheduleDefaults: { cronExpression: "0 9 * * *", timezone: "America/Chicago" },
    slug: "cloudflare-vercel-health-watch",
    targetRef: { goal: "Run infrastructure health watch." },
    targetType: "TASK",
  },
  {
    category: "Research",
    description: "Create a monthly executive research packet with sources and recommendations.",
    inputDefaults: { company: "Anthropic", depth: "deep" },
    name: "Monthly Executive Research Report",
    policyDefaults: { requireCitations: true },
    requiredConnectors: [],
    scheduleDefaults: { cronExpression: "0 9 1 * *", timezone: "America/Chicago" },
    slug: "monthly-executive-research-report",
    targetRef: { skillSlug: "research-company" },
    targetType: "WIDE_RESEARCH",
  },
] satisfies Array<Omit<ScheduleTemplateSummary, "createdAt" | "enabled" | "id" | "updatedAt">>;

export async function syncScheduleTemplates({ store = prisma }: { store?: ScheduleStore } = {}) {
  const templates = [];
  for (const template of BUILT_IN_TEMPLATES) {
    templates.push(await store.scheduleTemplate.upsert({
      create: {
        category: template.category,
        description: template.description,
        inputDefaults: jsonInput(template.inputDefaults),
        name: template.name,
        policyDefaults: jsonInput(template.policyDefaults),
        requiredConnectors: template.requiredConnectors,
        scheduleDefaults: jsonInput(template.scheduleDefaults),
        slug: template.slug,
        targetRef: jsonInput(template.targetRef),
        targetType: template.targetType,
      },
      update: {
        category: template.category,
        description: template.description,
        inputDefaults: jsonInput(template.inputDefaults),
        name: template.name,
        policyDefaults: jsonInput(template.policyDefaults),
        requiredConnectors: template.requiredConnectors,
        scheduleDefaults: jsonInput(template.scheduleDefaults),
        targetRef: jsonInput(template.targetRef),
        targetType: template.targetType,
      },
      where: { slug: template.slug },
    }));
  }
  return templates.map(serializeTemplate);
}

export async function listScheduleTemplates({ store = prisma }: { store?: ScheduleStore } = {}) {
  await syncScheduleTemplates({ store });
  const rows = await store.scheduleTemplate.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    where: { enabled: true },
  });
  return rows.map(serializeTemplate);
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
