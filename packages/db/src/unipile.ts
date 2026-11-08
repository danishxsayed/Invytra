/**
 * A small client for Unipile's API (https://developer.unipile.com), used for LinkedIn
 * accounts connected through Unipile: Unipile hosts the login page, keeps the session
 * and provides the IP. Server-side only: the API key never reaches a browser.
 */

export class UnipileError extends Error {
  constructor(
    readonly status: number,
    /** Unipile's error type, e.g. "errors/disconnected_account". */
    readonly type: string,
    readonly detail: string,
  ) {
    super(`LinkedIn connection ${status} ${type}${detail ? `: ${detail}` : ""}`);
    this.name = "UnipileError";
  }
  /** The LinkedIn session is gone: the account must be reconnected. */
  get disconnected(): boolean {
    return this.status === 401 || this.type.includes("disconnected_account");
  }
}

type Query = Record<string, string | number | boolean | undefined>;

export interface UnipileAccount {
  id: string;
  name?: string;
  type: string;
  created_at?: string;
  sources?: { id: string; status: string }[];
  connection_params?: { im?: { id?: string; publicIdentifier?: string; username?: string; proxy?: unknown } };
}

export interface UnipileUser {
  provider_id: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  network_distance?: "FIRST_DEGREE" | "SECOND_DEGREE" | "THIRD_DEGREE" | "OUT_OF_NETWORK" | string;
  is_premium?: boolean;
  is_relationship?: boolean;
  invitation?: { type?: string; status?: string };
  profile_picture_url?: string;
  /** Contact info: LinkedIn shows it only to 1st-degree connections, and only what they chose to share. */
  contact_info?: { emails?: string[] | null } | null;
}

export interface UnipileMe {
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  profile_picture_url?: string | null;
  premium?: boolean;
  occupation?: string;
}

export interface UnipileChat {
  id: string;
  /** A group's name, or the subject of a sponsored message / InMail; null for a normal 1-to-1 chat. */
  name?: string | null;
  attendee_provider_id?: string;
  unread_count?: number;
  timestamp?: string;
  /** 1 = nobody can reply (sponsored messages, LinkedIn offers). */
  read_only?: 0 | 1 | boolean;
  /** "sponsored", "linkedin_offer", "inmail", … (absent for normal chats). */
  content_type?: string;
  /** e.g. ["INBOX", "INBOX_LINKEDIN_CLASSIC"]; a company page's inbox is "INBOX_LINKEDIN_ORGANIZATION". */
  folder?: string[];
  disabledFeatures?: string[];
  /** 0 = 1-to-1, 1 = group. */
  type?: number;
}

/**
 * A chat with a person you can write back to. Sponsored messages (ads), LinkedIn's own
 * offers, read-only chats and a company page's inbox aren't conversations for outreach.
 */
export function isPersonChat(c: UnipileChat): boolean {
  if (Number(c.read_only) === 1) return false;
  if (c.content_type && ["sponsored", "linkedin_offer"].includes(c.content_type)) return false;
  if (c.disabledFeatures?.includes("reply")) return false;
  if (c.folder?.some((f) => f.includes("ORGANIZATION"))) return false;
  return true;
}

export interface UnipileMessage {
  id: string;
  text?: string | null;
  timestamp: string;
  is_sender: 0 | 1 | boolean;
}

export interface UnipileAttendee {
  id: string;
  provider_id?: string;
  name?: string;
  is_self?: 0 | 1 | boolean;
  profile_url?: string;
}

export interface UnipilePost {
  id: string;
  social_id: string;
  text?: string;
  is_repost?: boolean;
  /** ISO time of the post. */
  parsed_datetime?: string;
}

/** A profile with its sections (linkedin_sections=*): About, experience, education, skills. */
export interface UnipileFullProfile extends UnipileUser {
  summary?: string;
  location?: string;
  work_experience?: { company?: string; position?: string; location?: string; start?: string | null; end?: string | null; description?: string; skills?: string[] }[];
  education?: { school?: string; degree?: string; field_of_study?: string; start?: string | null; end?: string | null }[];
  skills?: { name?: string; endorsement_count?: number }[];
}

export interface UnipileSearchPerson {
  type?: string;
  id?: string;
  public_identifier?: string | null;
  profile_url?: string | null;
  public_profile_url?: string | null;
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  network_distance?: string;
  premium?: boolean;
  profile_picture_url?: string | null;
}

export interface UnipileInvitation {
  id: string;
  invited_user_id?: string;
  invited_user_public_id?: string;
}

export class UnipileClient {
  readonly base: string;
  constructor(
    dsn: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = /^https?:\/\//.test(dsn) ? dsn.replace(/\/$/, "") : `https://${dsn.replace(/\/$/, "")}`;
  }

  private async request<T>(method: string, path: string, opts: { query?: Query; json?: unknown; form?: FormData } = {}): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { "X-API-KEY": this.apiKey, accept: "application/json" };
    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.form) body = opts.form;
    const res = await this.fetchImpl(url, { method, headers, body, signal: AbortSignal.timeout(60_000) });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text.slice(0, 300) };
    }
    if (!res.ok) {
      const e = (data ?? {}) as { type?: string; detail?: string; title?: string };
      throw new UnipileError(res.status, e.type ?? "", e.detail ?? e.title ?? "");
    }
    return data as T;
  }

  // ---- Accounts ----

  /** A link to Unipile's hosted login page (to connect a new account or reconnect one). */
  async hostedLink(body: {
    type: "create" | "reconnect";
    providers: string[];
    expiresOn: string;
    name?: string;
    success_redirect_url?: string;
    failure_redirect_url?: string;
    notify_url?: string;
    reconnect_account?: string;
    bypass_success_screen?: boolean;
  }): Promise<string> {
    const r = await this.request<{ url: string }>("POST", "/api/v1/hosted/accounts/link", { json: { ...body, api_url: this.base } });
    return r.url;
  }

  async listAccounts(): Promise<UnipileAccount[]> {
    const out: UnipileAccount[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await this.request<{ items: UnipileAccount[]; cursor?: string | null }>("GET", "/api/v1/accounts", { query: { limit: 250, cursor } });
      out.push(...(r.items ?? []));
      if (!r.cursor) break;
      cursor = r.cursor;
    }
    return out;
  }

  getAccount(id: string): Promise<UnipileAccount> {
    return this.request("GET", `/api/v1/accounts/${encodeURIComponent(id)}`);
  }

  async deleteAccount(id: string): Promise<void> {
    await this.request("DELETE", `/api/v1/accounts/${encodeURIComponent(id)}`);
  }

  // ---- People ----

  me(accountId: string): Promise<UnipileMe> {
    return this.request("GET", "/api/v1/users/me", { query: { account_id: accountId } });
  }

  /** A profile by public id (the /in/<slug> part) or provider id. notify=true shows them a profile view. */
  user(accountId: string, identifier: string, notify = false): Promise<UnipileUser> {
    return this.request("GET", `/api/v1/users/${encodeURIComponent(identifier)}`, { query: { account_id: accountId, notify } });
  }

  /** A profile with its About, experience, education and skills sections. */
  fullProfile(accountId: string, identifier: string): Promise<UnipileFullProfile> {
    return this.request("GET", `/api/v1/users/${encodeURIComponent(identifier)}`, { query: { account_id: accountId, linkedin_sections: "*" } });
  }

  invite(accountId: string, providerId: string, message?: string): Promise<{ invitation_id?: string; usage?: number }> {
    return this.request("POST", "/api/v1/users/invite", { json: { account_id: accountId, provider_id: providerId, ...(message ? { message } : {}) } });
  }

  sentInvitations(accountId: string, cursor?: string): Promise<{ items: UnipileInvitation[]; cursor?: string | null }> {
    return this.request("GET", "/api/v1/users/invite/sent", { query: { account_id: accountId, limit: 100, cursor } });
  }

  async cancelInvitation(accountId: string, invitationId: string): Promise<void> {
    await this.request("DELETE", `/api/v1/users/invite/sent/${encodeURIComponent(invitationId)}`, { query: { account_id: accountId } });
  }

  // ---- Messaging ----

  /** Opens (or reuses) the 1-to-1 chat with someone and sends the text. */
  /** Starts (or continues) the chat with this person. An image, if given, goes as an attachment. */
  /** A new message to someone: text, and/or an image (handwritten note), or a voice message (.m4a/.mp3). */
  startChat(
    accountId: string,
    providerId: string,
    text: string,
    image?: { png: Buffer; name: string },
    voice?: { data: Buffer; name: string; type: string },
  ): Promise<{ chat_id: string; message_id?: string }> {
    const form = new FormData();
    form.set("account_id", accountId);
    form.append("attendees_ids", providerId);
    if (text) form.set("text", text);
    if (image) form.append("attachments", new Blob([new Uint8Array(image.png)], { type: "image/png" }), image.name);
    if (voice) form.append("voice_message", new Blob([new Uint8Array(voice.data)], { type: voice.type }), voice.name);
    return this.request("POST", "/api/v1/chats", { form });
  }

  sendInChat(chatId: string, text: string, accountId?: string): Promise<{ message_id?: string }> {
    const form = new FormData();
    form.set("text", text);
    if (accountId) form.set("account_id", accountId);
    return this.request("POST", `/api/v1/chats/${encodeURIComponent(chatId)}/messages`, { form });
  }

  async chats(accountId: string, limit = 30): Promise<UnipileChat[]> {
    const r = await this.request<{ items: UnipileChat[] }>("GET", "/api/v1/chats", { query: { account_id: accountId, limit } });
    return r.items ?? [];
  }

  async chatMessages(chatId: string, limit = 30): Promise<UnipileMessage[]> {
    const r = await this.request<{ items: UnipileMessage[] }>("GET", `/api/v1/chats/${encodeURIComponent(chatId)}/messages`, { query: { limit } });
    return r.items ?? [];
  }

  async chatAttendees(chatId: string): Promise<UnipileAttendee[]> {
    const r = await this.request<{ items: UnipileAttendee[] }>("GET", `/api/v1/chats/${encodeURIComponent(chatId)}/attendees`);
    return r.items ?? [];
  }

  // ---- Posts ----

  /** Someone's latest posts. `providerId` is their provider_id (a public /in/ name isn't accepted). */
  async userPosts(accountId: string, identifier: string, limit = 5): Promise<UnipilePost[]> {
    const r = await this.request<{ items: UnipilePost[] }>("GET", `/api/v1/users/${encodeURIComponent(identifier)}/posts`, { query: { account_id: accountId, limit } });
    return r.items ?? [];
  }

  async react(accountId: string, socialId: string): Promise<void> {
    await this.request("POST", "/api/v1/posts/reaction", { json: { account_id: accountId, post_id: socialId, reaction_type: "like" } });
  }

  async comment(accountId: string, socialId: string, text: string): Promise<void> {
    await this.request("POST", `/api/v1/posts/${encodeURIComponent(socialId)}/comments`, { json: { account_id: accountId, text } });
  }

  // ---- Search ----

  /** People from a LinkedIn or Sales Navigator search link, one page at a time. */
  search(accountId: string, url: string, limit: number, cursor?: string): Promise<{ items: UnipileSearchPerson[]; cursor?: string | null; paging?: { total_count?: number } }> {
    return this.request("POST", "/api/v1/linkedin/search", { query: { account_id: accountId, limit, cursor }, json: cursor ? { cursor } : { url } });
  }

  /** Downloads a picture (e.g. a profile photo URL Unipile gave us). */
  async download(url: string, maxBytes = 300_000): Promise<{ base64: string; type: string } | null> {
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > maxBytes) return null;
    return { base64: buf.toString("base64"), type };
  }
}

/** The configured client, or null when UNIPILE_DSN / UNIPILE_API_KEY aren't set. */
export function unipileFromEnv(env: NodeJS.ProcessEnv = process.env): UnipileClient | null {
  const dsn = env.UNIPILE_DSN?.trim();
  const key = env.UNIPILE_API_KEY?.trim();
  return dsn && key ? new UnipileClient(dsn, key) : null;
}

/** The name Invytra gives an account at Unipile, to find it again after the hosted login. */
export const unipileName = (accountId: string) => `invytra:${accountId}`;

/** Status of a Unipile account: "OK" when it works. */
export function unipileStatus(a: UnipileAccount): string {
  return a.sources?.[0]?.status ?? "CONNECTING";
}
