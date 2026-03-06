export async function requestJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const targets = (() => {
    if (!url.startsWith("/api")) return [url];
    return [
      url, // prefer Vite proxy in dev
      `http://127.0.0.1:3000${url}`,
      `http://localhost:3000${url}`,
      `http://127.0.0.1:4000${url}`,
      `http://localhost:4000${url}`,
    ];
  })();

  let response: Response | null = null;
  let lastNetworkError: unknown = null;

  for (const targetUrl of targets) {
    try {
      response = await fetch(targetUrl, init);
      break;
    } catch (error) {
      lastNetworkError = error;
    }
  }

  if (!response) {
    throw new Error("Backend is offline. Run npm run server (or npm run dev from launcher).");
  }

  const raw = await response.text();
  let payload: any = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { error: "Invalid server response." };
    }
  }

  if (!response.ok) {
    if (!payload?.error && response.status >= 500 && url.startsWith("/api")) {
      throw new Error("Backend is offline or proxy failed. Run npm run server.");
    }
    throw new Error(payload?.error || `Request failed (${response.status}).`);
  }

  return payload as T;
}

