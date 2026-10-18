/** Playwright proxy settings parsed from http://user:pass@host:port */
export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

export function parseProxyUrl(raw: string): ProxySettings {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Proxy URL is not valid. Expected format: http://user:pass@host:port");
  }
  if (!["http:", "https:", "socks5:"].includes(url.protocol)) {
    throw new Error(`Unsupported proxy protocol ${url.protocol} — use http, https or socks5`);
  }
  if (!url.hostname || !url.port) {
    throw new Error("Proxy URL must include a host and port");
  }
  return {
    server: `${url.protocol}//${url.hostname}:${url.port}`,
    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
  };
}

/** For logs: never print proxy credentials. */
export function redactProxyUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.username ? "***@" : ""}${url.hostname}:${url.port}`;
  } catch {
    return "(invalid proxy url)";
  }
}
