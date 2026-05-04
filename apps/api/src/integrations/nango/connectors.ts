import type { IntegrationConnectorId } from "@handle/shared";
import type { IntegrationConnectorId as PrismaConnectorId } from "@prisma/client";

export type IntegrationAuthType = "local-vault" | "nango";

export interface IntegrationConnectorMetadata {
  authType: IntegrationAuthType;
  connectorId: IntegrationConnectorId;
  description: string;
  displayName: string;
  docsUrl?: string;
  nangoIntegrationId: string | null;
  nangoProviderId: string | null;
  oauthAppUrl?: string;
  prismaId: PrismaConnectorId;
  requiredScopes: string[];
  setupGuide: string[];
  tier: 1 | 2 | 3;
}

export const NANGO_REDIRECT_URI = "https://api.nango.dev/oauth/callback";

export const connectorOrder: IntegrationConnectorId[] = [
  "gmail",
  "slack",
  "notion",
  "google-drive",
  "github",
  "google-calendar",
  "cloudflare",
  "vercel",
  "linear",
  "google-sheets",
  "google-docs",
  "zapier",
  "obsidian",
];

export const connectorMetadata: Record<
  IntegrationConnectorId,
  IntegrationConnectorMetadata
> = {
  "google-calendar": {
    authType: "nango",
    connectorId: "google-calendar",
    description: "Read and manage calendar events.",
    displayName: "Google Calendar",
    docsUrl: "https://docs.nango.dev/integrations/all/google-calendar",
    nangoIntegrationId: "handle-dev-google-calendar",
    nangoProviderId: "google-calendar",
    oauthAppUrl: "https://console.cloud.google.com/apis/credentials",
    prismaId: "GOOGLE_CALENDAR",
    requiredScopes: [
      "openid",
      "profile",
      "email",
      "https://www.googleapis.com/auth/calendar",
    ],
    setupGuide: [
      "Open Google Cloud Console credentials.",
      "Create an OAuth Web application named Handle Dev - Google Calendar.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 2,
  },
  "google-docs": {
    authType: "nango",
    connectorId: "google-docs",
    description: "Read and edit Google Docs through Google OAuth.",
    docsUrl: "https://docs.nango.dev/integrations/all/google",
    displayName: "Google Docs",
    nangoIntegrationId: "handle-dev-google-docs",
    nangoProviderId: "google",
    oauthAppUrl: "https://console.cloud.google.com/apis/credentials",
    prismaId: "GOOGLE_DOCS",
    requiredScopes: [
      "openid",
      "profile",
      "email",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file",
    ],
    setupGuide: [
      "Open Google Cloud Console credentials.",
      "Create an OAuth Web application named Handle Dev - Google Docs.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 3,
  },
  "google-drive": {
    authType: "nango",
    connectorId: "google-drive",
    description: "Search, read, upload, and share Drive files.",
    displayName: "Google Drive",
    docsUrl: "https://docs.nango.dev/integrations/all/google-drive",
    nangoIntegrationId: "handle-dev-google-drive",
    nangoProviderId: "google-drive",
    oauthAppUrl: "https://console.cloud.google.com/apis/credentials",
    prismaId: "GOOGLE_DRIVE",
    requiredScopes: [
      "openid",
      "profile",
      "email",
      "https://www.googleapis.com/auth/drive",
    ],
    setupGuide: [
      "Open Google Cloud Console credentials.",
      "Create an OAuth Web application named Handle Dev - Google Drive.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 1,
  },
  "google-sheets": {
    authType: "nango",
    connectorId: "google-sheets",
    description: "Read and update Google Sheets.",
    displayName: "Google Sheets",
    docsUrl: "https://docs.nango.dev/integrations/all/google-sheet",
    nangoIntegrationId: "handle-dev-google-sheets",
    nangoProviderId: "google-sheet",
    oauthAppUrl: "https://console.cloud.google.com/apis/credentials",
    prismaId: "GOOGLE_SHEETS",
    requiredScopes: [
      "openid",
      "profile",
      "email",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
    setupGuide: [
      "Open Google Cloud Console credentials.",
      "Create an OAuth Web application named Handle Dev - Google Sheets.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 3,
  },
  "gmail": {
    authType: "nango",
    connectorId: "gmail",
    description: "Search, read, draft, and send Gmail messages.",
    displayName: "Gmail",
    docsUrl: "https://docs.nango.dev/integrations/all/google-mail",
    nangoIntegrationId: "handle-dev-gmail",
    nangoProviderId: "google-mail",
    oauthAppUrl: "https://console.cloud.google.com/apis/credentials",
    prismaId: "GMAIL",
    requiredScopes: [
      "openid",
      "profile",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    setupGuide: [
      "Open Google Cloud Console credentials.",
      "Create an OAuth Web application named Handle Dev - Gmail.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 1,
  },
  "github": {
    authType: "nango",
    connectorId: "github",
    description: "Read and act on GitHub repositories, issues, and pull requests.",
    displayName: "GitHub",
    docsUrl: "https://docs.nango.dev/integrations/all/github",
    nangoIntegrationId: "handle-dev-github",
    nangoProviderId: "github",
    oauthAppUrl: "https://github.com/settings/developers",
    prismaId: "GITHUB",
    requiredScopes: ["read:user", "user:email", "repo"],
    setupGuide: [
      "Open GitHub Developer Settings.",
      "Create an OAuth app named Handle Dev - GitHub.",
      `Add callback URL ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 1,
  },
  "cloudflare": {
    authType: "nango",
    connectorId: "cloudflare",
    description: "Inspect and manage Cloudflare zones, DNS, and Pages.",
    displayName: "Cloudflare",
    docsUrl: "https://docs.nango.dev/integrations/all/cloudflare",
    nangoIntegrationId: "handle-dev-cloudflare",
    nangoProviderId: "cloudflare",
    oauthAppUrl: "https://dash.cloudflare.com/profile/api-tokens",
    prismaId: "CLOUDFLARE",
    requiredScopes: ["account:read", "zone:read", "dns:edit"],
    setupGuide: [
      "Open Cloudflare API/OAuth settings.",
      "Create an app named Handle Dev - Cloudflare.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 2,
  },
  "linear": {
    authType: "nango",
    connectorId: "linear",
    description: "Search and update Linear teams, projects, and issues.",
    displayName: "Linear",
    docsUrl: "https://docs.nango.dev/integrations/all/linear",
    nangoIntegrationId: "handle-dev-linear",
    nangoProviderId: "linear",
    oauthAppUrl: "https://linear.app/settings/api/applications",
    prismaId: "LINEAR",
    requiredScopes: ["read", "write"],
    setupGuide: [
      "Open Linear OAuth application settings.",
      "Create an OAuth app named Handle Dev - Linear.",
      `Add callback URL ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 2,
  },
  "notion": {
    authType: "nango",
    connectorId: "notion",
    description: "Search, read, and update Notion pages and databases.",
    displayName: "Notion",
    docsUrl: "https://docs.nango.dev/integrations/all/notion",
    nangoIntegrationId: "handle-dev-notion",
    nangoProviderId: "notion",
    oauthAppUrl: "https://www.notion.so/my-integrations",
    prismaId: "NOTION",
    requiredScopes: [],
    setupGuide: [
      "Open Notion integrations.",
      "Create a public integration named Handle Dev - Notion.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the OAuth client ID and client secret here.",
    ],
    tier: 1,
  },
  "obsidian": {
    authType: "local-vault",
    connectorId: "obsidian",
    description: "Read and edit one local Obsidian vault through SafetyGovernor.",
    displayName: "Obsidian",
    nangoIntegrationId: null,
    nangoProviderId: null,
    prismaId: "OBSIDIAN",
    requiredScopes: [],
    setupGuide: [
      "Choose one local vault path.",
      "Handle will deny path traversal and symlink escapes outside that vault.",
      "Multi-vault support is deferred to Phase 11.",
    ],
    tier: 3,
  },
  "slack": {
    authType: "nango",
    connectorId: "slack",
    description: "Search Slack and send controlled messages.",
    displayName: "Slack",
    docsUrl: "https://docs.nango.dev/integrations/all/slack",
    nangoIntegrationId: "handle-dev-slack",
    nangoProviderId: "slack",
    oauthAppUrl: "https://api.slack.com/apps",
    prismaId: "SLACK",
    requiredScopes: [
      "channels:history",
      "channels:read",
      "chat:write",
      "groups:history",
      "groups:read",
      "users:read",
    ],
    setupGuide: [
      "Open Slack API apps.",
      "Create an app named Handle Dev - Slack.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 1,
  },
  "vercel": {
    authType: "nango",
    connectorId: "vercel",
    description: "Inspect projects and manage deployments.",
    displayName: "Vercel",
    docsUrl: "https://docs.nango.dev/integrations/all/vercel",
    nangoIntegrationId: "handle-dev-vercel",
    nangoProviderId: "vercel",
    oauthAppUrl: "https://vercel.com/dashboard/integrations/console",
    prismaId: "VERCEL",
    requiredScopes: [],
    setupGuide: [
      "Open Vercel integration settings.",
      "Create an integration named Handle Dev - Vercel.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 2,
  },
  "zapier": {
    authType: "nango",
    connectorId: "zapier",
    description: "Trigger Zaps, read history, and create Zaps in Phase 6.1.",
    displayName: "Zapier",
    docsUrl: "https://docs.nango.dev/integrations/all/zapier-nla",
    nangoIntegrationId: "handle-dev-zapier",
    nangoProviderId: "zapier-nla",
    oauthAppUrl: "https://developer.zapier.com/",
    prismaId: "ZAPIER",
    requiredScopes: [],
    setupGuide: [
      "Open Zapier Developer Platform.",
      "Create an app named Handle Dev - Zapier.",
      `Add redirect URI ${NANGO_REDIRECT_URI}.`,
      "Paste the client ID and client secret here.",
    ],
    tier: 3,
  },
};

export function connectorById(connectorId: string) {
  return connectorMetadata[connectorId as IntegrationConnectorId] ?? null;
}

export function connectorByPrismaId(connectorId: PrismaConnectorId) {
  return (
    Object.values(connectorMetadata).find(
      (connector) => connector.prismaId === connectorId,
    ) ?? null
  );
}

export function connectorScopesString(connector: IntegrationConnectorMetadata) {
  return connector.requiredScopes.join(",");
}
