import { getConfig } from "@/lib/config";

interface FaxBackSessionState {
  loginId: string;
  lastRefresh: Date;
  refreshTimer: ReturnType<typeof setInterval> | null;
}

let sessionState: FaxBackSessionState | null = null;
let loginPromise: Promise<string> | null = null;

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function login(): Promise<string> {
  const config = await getConfig();

  const url = `${config.faxbackApiUrl}/nsx/Login`;
  const body =
    `<NSX><Credentials>` +
    `<UserName>${xmlEscape(config.faxbackUsername)}</UserName>` +
    `<Password>${xmlEscape(config.faxbackPassword)}</Password>` +
    `</Credentials></NSX>`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`FaxBack Login failed: ${res.status} ${res.statusText} at ${url} ${errBody ? `- ${errBody.slice(0, 300)}` : ""}`);
  }

  const text = await res.text();

  // NSX REST returns either JSON { "NSX": { "LoginId": "..." } } or XML <NSX><LoginId>...</LoginId></NSX>
  try {
    const json = JSON.parse(text);
    const id = json?.NSX?.LoginId ?? json?.LoginId;
    if (typeof id === "string" && id.length > 0) return id;
  } catch {
    // Not JSON — try XML
  }
  const m = text.match(/<LoginId>\s*([^<\s]+)\s*<\/LoginId>/i);
  if (m && m[1]) return m[1];

  throw new Error(`FaxBack Login response missing LoginId: ${text.slice(0, 300)}`);
}

async function refreshSession(): Promise<void> {
  if (!sessionState) return;
  const config = await getConfig();

  try {
    const res = await fetch(
      `${config.faxbackApiUrl}/nsx/RefreshId?LoginId=${sessionState.loginId}`
    );
    if (!res.ok) {
      console.warn("FaxBack RefreshId failed, re-authenticating...");
      sessionState.loginId = await login();
    }
    sessionState.lastRefresh = new Date();
  } catch (error) {
    console.error("FaxBack refresh error:", error);
    try {
      sessionState.loginId = await login();
      sessionState.lastRefresh = new Date();
    } catch (loginError) {
      console.error("FaxBack re-login failed:", loginError);
    }
  }
}

/**
 * Initialize the supervisor session. Call once at app startup.
 */
export async function initFaxBackSession(): Promise<void> {
  if (sessionState?.refreshTimer) return; // Already initialized

  const loginId = await login();

  sessionState = {
    loginId,
    lastRefresh: new Date(),
    refreshTimer: setInterval(refreshSession, 3 * 60 * 1000), // 3 min
  };

  console.log("FaxBack supervisor session initialized.");
}

/**
 * Get the current LoginId. Initializes session if needed.
 */
export async function getLoginId(): Promise<string> {
  if (sessionState) return sessionState.loginId;

  // Prevent concurrent initialization
  if (!loginPromise) {
    loginPromise = (async () => {
      await initFaxBackSession();
      loginPromise = null;
      return sessionState!.loginId;
    })();
  }
  return loginPromise;
}

/**
 * Make an authenticated FaxBack API call.
 * Automatically appends LoginId and retries once on 401.
 */
export async function faxbackFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = await getConfig();
  const loginId = await getLoginId();

  // All non-session endpoints live under /mqs/
  const cleanPath = path.replace(/^\/+/, "");
  const separator = cleanPath.includes("?") ? "&" : "?";
  const url = `${config.faxbackApiUrl}/mqs/${cleanPath}${separator}LoginId=${loginId}`;

  let res = await fetch(url, options);

  // Retry on 401: re-login and try once more
  if (res.status === 401) {
    console.warn(`FaxBack 401 on ${cleanPath}, re-authenticating...`);
    const newLoginId = await login();
    sessionState!.loginId = newLoginId;
    sessionState!.lastRefresh = new Date();

    const retryUrl = `${config.faxbackApiUrl}/mqs/${cleanPath}${separator}LoginId=${newLoginId}`;
    res = await fetch(retryUrl, options);
  }

  return res;
}

/**
 * Shut down the supervisor session (for graceful shutdown).
 */
export function destroyFaxBackSession(): void {
  if (sessionState?.refreshTimer) {
    clearInterval(sessionState.refreshTimer);
  }
  sessionState = null;
}
