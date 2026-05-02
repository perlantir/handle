export type BrowserMode = "actual-chrome" | "separate-profile";

export interface BrowserSettings {
  actualChromeEndpoint: string;
  mode: BrowserMode;
  profileDir: string;
  updatedAt: string | null;
}

interface BrowserResponse {
  browser?: BrowserSettings;
}

interface ResetProfileResponse {
  profileDir: string;
  reset: boolean;
}

interface ActualChromeConnectionResponse {
  connected: boolean;
  detail: string | null;
  endpoint: string;
}

async function parseApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Browser settings request failed");
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function getBrowserSettings() {
  const body = await requestJson<BrowserResponse>("/api/settings/browser");
  if (!body.browser) throw new Error("Browser settings response was empty.");
  return body.browser;
}

export async function updateBrowserSettings(input: { mode: BrowserMode }) {
  const body = await requestJson<BrowserResponse>("/api/settings/browser", {
    body: JSON.stringify(input),
    method: "PUT",
  });
  if (!body.browser) throw new Error("Browser settings update was empty.");
  return body.browser;
}

export async function resetBrowserProfile() {
  return requestJson<ResetProfileResponse>(
    "/api/settings/browser/reset-profile",
    {
      method: "POST",
    },
  );
}

export async function testActualChromeConnection() {
  return requestJson<ActualChromeConnectionResponse>(
    "/api/settings/browser/test-actual-chrome",
    {
      method: "POST",
    },
  );
}
