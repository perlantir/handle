export type RiskLevel = "safe" | "approve" | "deny";

export interface BrowserPageContext {
  html?: string;
  url: string;
}

export interface RiskClassification {
  level: RiskLevel;
  reason: string;
  matchedRule?: string;
}

const DESTRUCTIVE_BUTTON_RE =
  /delete|remove|destroy|cancel\s+account|deactivate|unsubscribe/i;
const FORM_SUBMIT_TEXT_RE =
  /submit|send|purchase|buy|pay|order|delete|remove|confirm|approve/i;
const PAYMENT_URL_RE = /\/(checkout|payment|billing|cart)(?:[/?#]|$)/i;
const AUTH_URL_RE = /\/(login|signin|auth|oauth|account|settings)(?:[/?#]|$)/i;
const CARD_AUTOCOMPLETE_RE = /autocomplete\s*=\s*["']cc-[^"']+["']/i;
const CARD_LABEL_RE = /credit\s*card|card\s*number|cvc|cvv|expiration|expiry/i;

function safe(reason = "No risky browser action rules matched"): RiskClassification {
  return { level: "safe", reason };
}

function approve(reason: string, matchedRule: string): RiskClassification {
  return { level: "approve", matchedRule, reason };
}

function normalizeAction(action: string) {
  return action.replace(/^browser_/, "");
}

function normalizedUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function htmlText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buttonSnippets(html: string) {
  const snippets: string[] = [];
  const buttonRe = /<button\b[^>]*>[\s\S]*?<\/button>/gi;
  const inputRe = /<input\b[^>]*(?:type\s*=\s*["']?(?:submit|button)["']?)[^>]*>/gi;

  for (const match of html.matchAll(buttonRe)) snippets.push(match[0] ?? "");
  for (const match of html.matchAll(inputRe)) snippets.push(match[0] ?? "");

  return snippets;
}

function snippetText(snippet: string) {
  const valueAttr = snippet.match(/\bvalue\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
  const ariaLabel = snippet.match(/\baria-label\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
  return [htmlText(snippet), valueAttr, ariaLabel].filter(Boolean).join(" ").trim();
}

function selectorCouldTargetButton(target: string) {
  const value = target.trim().toLowerCase();
  return (
    value === "button" ||
    value.includes("button") ||
    value.includes("submit") ||
    value.includes("delete") ||
    value.includes("remove") ||
    value.includes("destroy")
  );
}

function containsPaymentField(html: string, target?: string) {
  if (CARD_AUTOCOMPLETE_RE.test(html)) return true;
  if (target && /cc-|card|cvc|cvv|expiry|expiration/i.test(target)) return true;
  return CARD_LABEL_RE.test(html) && /<input\b/i.test(html);
}

export function hostMatchesTrustedDomains(url: string, trustedDomains: string[] = []) {
  const parsed = normalizedUrl(url);
  if (!parsed) return false;

  const hostname = parsed.hostname.toLowerCase();
  return trustedDomains.some((domain) => {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) return false;
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

export function classifyBrowserAction(
  action: string,
  target: string,
  pageContext: BrowserPageContext,
): RiskClassification {
  const normalizedAction = normalizeAction(action);
  const html = pageContext.html ?? "";
  const targetUrl =
    normalizedAction === "navigate" ? normalizedUrl(target) : normalizedUrl(pageContext.url);

  if (normalizedAction === "navigate" && targetUrl && PAYMENT_URL_RE.test(targetUrl.pathname)) {
    return approve("Navigating to payment flow", "payment_url");
  }

  if (normalizedAction === "navigate" && targetUrl && AUTH_URL_RE.test(targetUrl.pathname)) {
    return approve("Navigating to auth-sensitive page", "auth_sensitive_url");
  }

  if (normalizedAction === "type" && containsPaymentField(html, target)) {
    return approve("Typing into payment field", "payment_field");
  }

  if (normalizedAction === "click") {
    for (const snippet of buttonSnippets(html)) {
      const text = snippetText(snippet);
      if (!text) continue;

      if (DESTRUCTIVE_BUTTON_RE.test(text)) {
        return approve(
          `Click appears to trigger destructive action: ${text}`,
          "destructive_button_label",
        );
      }

      const isSubmit =
        /type\s*=\s*["']?submit["']?/i.test(snippet) ||
        /<button\b/i.test(snippet) ||
        /<form\b[\s\S]*\baction\s*=/i.test(html);

      if (isSubmit && selectorCouldTargetButton(target) && FORM_SUBMIT_TEXT_RE.test(text)) {
        return approve("Click appears to submit a form", "submit_button");
      }
    }
  }

  return safe();
}
