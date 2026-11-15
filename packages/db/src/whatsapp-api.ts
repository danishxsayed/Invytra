import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Meta's WhatsApp Cloud API (Graph API): finishing Embedded Signup (code → business token,
 * subscribing our app to the customer's WhatsApp Business Account, registering the number,
 * sharing our credit line so Invytra pays for messages), reading the number, the business
 * profile, message templates, and checking webhook signatures. App keys only from .env
 * (META_APP_ID, META_APP_SECRET, META_ES_CONFIG_ID, META_WEBHOOK_VERIFY_TOKEN,
 * META_CREDIT_LINE_ID, META_GRAPH_VERSION); tokens are never logged.
 */

export interface MetaApp {
  appId: string;
  appSecret: string;
  /** Embedded Signup configuration (Facebook Login for Business). */
  configId: string;
  verifyToken: string;
  /** Invytra's extended credit line: when set, messages are billed to Invytra. */
  creditLineId?: string;
  version: string;
}

export function metaApp(env: NodeJS.ProcessEnv = process.env): MetaApp | null {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  const configId = env.META_ES_CONFIG_ID?.trim();
  if (!appId || !appSecret || !configId) return null;
  return {
    appId,
    appSecret,
    configId,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "",
    creditLineId: env.META_CREDIT_LINE_ID?.trim() || undefined,
    version: env.META_GRAPH_VERSION?.trim() || "v23.0",
  };
}

export class MetaError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly status?: number,
    /** Meta's own words (for send errors shown per message) */
    readonly raw?: string,
  ) {
    super(message);
  }
}

export interface MetaPhone {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  code_verification_status?: string;
  status?: string;
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: unknown[];
  rejected_reason?: string;
  quality_score?: { score?: string };
}

export interface MetaProfile {
  about?: string;
  description?: string;
  email?: string;
  address?: string;
  websites?: string[];
  vertical?: string;
  profile_picture_url?: string;
}

const PHONE_FIELDS = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status,status";
const TEMPLATE_FIELDS = "id,name,language,status,category,components,rejected_reason,quality_score";

/** Meta's error, in words a customer can act on. */
export function metaErrorText(code: number | undefined, message: string): string {
  if (code === 190) return "Meta ended the connection (the access was removed or expired). Connect the number again.";
  if (code === 10 || code === 200) return "Meta refused: the permission for this was not given. Connect the number again and allow everything asked.";
  if (code === 4 || code === 80007 || code === 130429) return "Meta is limiting requests right now. Try again in a few minutes.";
  if (code === 133005) return "The number's two-step verification PIN doesn't match. Remove the PIN in WhatsApp Manager, then connect again.";
  if (code === 2388024) return "A template with this name and language already exists. Choose another name.";
  return `Meta refused: ${message.slice(0, 200)}`;
}

export class MetaClient {
  constructor(
    private readonly app: MetaApp,
    /** The business token for this customer's WhatsApp account (from Embedded Signup). */
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly base = "https://graph.facebook.com",
  ) {}

  private url(path: string, query?: Record<string, string>) {
    const q = query ? `?${new URLSearchParams(query)}` : "";
    return `${this.base}/${this.app.version}/${path.replace(/^\//, "")}${q}`;
  }

  private async call<T>(method: "GET" | "POST" | "DELETE", path: string, opts: { query?: Record<string, string>; body?: unknown; token?: string } = {}): Promise<T> {
    const res = await this.fetchImpl(this.url(path, opts.query), {
      method,
      headers: { authorization: `Bearer ${opts.token ?? this.token}`, ...(opts.body !== undefined && { "content-type": "application/json" }) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(25_000),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_user_msg?: string } };
    if (!res.ok || data.error) {
      const e = data.error ?? {};
      throw new MetaError(metaErrorText(e.code, e.error_user_msg || e.message || `HTTP ${res.status}`), e.code, res.status, e.error_user_msg || e.message);
    }
    return data as T;
  }

  /** Embedded Signup's code → the customer's business token. */
  static async exchangeCode(app: MetaApp, code: string, fetchImpl: typeof fetch = fetch, base = "https://graph.facebook.com"): Promise<string> {
    const q = new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, code });
    const res = await fetchImpl(`${base}/${app.version}/oauth/access_token?${q}`, { signal: AbortSignal.timeout(25_000) });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string; code?: number } };
    if (!res.ok || !data.access_token) throw new MetaError(metaErrorText(data.error?.code, data.error?.message ?? "the sign-in code was refused"), data.error?.code, res.status);
    return data.access_token;
  }

  /** Lets our app receive this account's webhooks (messages, statuses, template reviews). */
  subscribeApp(wabaId: string) {
    return this.call<{ success: boolean }>("POST", `${wabaId}/subscribed_apps`, { body: {} });
  }

  /** Puts the number on the Cloud API, with a two-step verification PIN. */
  register(phoneNumberId: string, pin: string) {
    return this.call<{ success: boolean }>("POST", `${phoneNumberId}/register`, { body: { messaging_product: "whatsapp", pin } });
  }

  deregister(phoneNumberId: string) {
    return this.call<{ success: boolean }>("POST", `${phoneNumberId}/deregister`, { body: {} });
  }

  unsubscribeApp(wabaId: string) {
    return this.call<{ success: boolean }>("DELETE", `${wabaId}/subscribed_apps`);
  }

  /** Bills this account's messages to our credit line (Solution Partners only). Uses our app token. */
  shareCreditLine(wabaId: string, currency = "USD") {
    if (!this.app.creditLineId) throw new MetaError("No credit line is set up.");
    return this.call<{ allocation_config_id?: string; waba_id?: string }>("POST", `${this.app.creditLineId}/whatsapp_credit_sharing_and_attach`, {
      query: { waba_id: wabaId, waba_currency: currency },
      token: `${this.app.appId}|${this.app.appSecret}`,
    });
  }

  phone(phoneNumberId: string) {
    return this.call<MetaPhone>("GET", phoneNumberId, { query: { fields: PHONE_FIELDS } });
  }

  async profile(phoneNumberId: string): Promise<MetaProfile> {
    const r = await this.call<{ data?: MetaProfile[] }>("GET", `${phoneNumberId}/whatsapp_business_profile`, { query: { fields: "about,description,email,address,websites,vertical,profile_picture_url" } });
    return r.data?.[0] ?? {};
  }

  updateProfile(phoneNumberId: string, p: Omit<MetaProfile, "profile_picture_url">) {
    return this.call<{ success: boolean }>("POST", `${phoneNumberId}/whatsapp_business_profile`, { body: { messaging_product: "whatsapp", ...p } });
  }

  /** Every template of the account (follows Meta's pages). */
  async templates(wabaId: string): Promise<MetaTemplate[]> {
    const out: MetaTemplate[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = await this.call<{ data: MetaTemplate[]; paging?: { cursors?: { after?: string }; next?: string } }>("GET", `${wabaId}/message_templates`, {
        query: { fields: TEMPLATE_FIELDS, limit: "100", ...(after && { after }) },
      });
      out.push(...(r.data ?? []));
      after = r.paging?.next ? r.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return out;
  }

  createTemplate(wabaId: string, template: { name: string; language: string; category: string; components: unknown[] }) {
    return this.call<{ id: string; status: string; category: string }>("POST", `${wabaId}/message_templates`, { body: template });
  }

  deleteTemplate(wabaId: string, name: string, metaId?: string) {
    return this.call<{ success: boolean }>("DELETE", `${wabaId}/message_templates`, { query: { name, ...(metaId && { hsm_id: metaId }) } });
  }

  /** Sends an approved template to one person → Meta's message id (wamid). */
  async sendTemplate(phoneNumberId: string, to: string, t: { name: string; language: string; components: unknown[] }): Promise<string> {
    const r = await this.call<{ messages?: { id: string }[] }>("POST", `${phoneNumberId}/messages`, {
      body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: { name: t.name, language: { code: t.language }, ...(t.components.length && { components: t.components }) } },
    });
    const id = r.messages?.[0]?.id;
    if (!id) throw new MetaError("Meta didn't return a message id.");
    return id;
  }

  /** Uploads a sample file for a template header (Resumable Upload) → its handle. */
  async uploadSample(file: { bytes: Uint8Array; type: string; name: string }): Promise<string> {
    const session = await this.call<{ id: string }>("POST", `${this.app.appId}/uploads`, {
      query: { file_name: file.name, file_length: String(file.bytes.byteLength), file_type: file.type },
    });
    const res = await this.fetchImpl(this.url(session.id), {
      method: "POST",
      headers: { authorization: `OAuth ${this.token}`, file_offset: "0" },
      body: file.bytes,
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json().catch(() => ({}))) as { h?: string; error?: { message?: string; code?: number } };
    if (!res.ok || !data.h) throw new MetaError(metaErrorText(data.error?.code, data.error?.message ?? "the image upload failed"), data.error?.code, res.status);
    return data.h;
  }
}

/** Meta signs each webhook with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function metaSignatureOk(raw: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", appSecret).update(raw, "utf8").digest("hex"));
  const got = Buffer.from(header.slice(7));
  return got.length === want.length && timingSafeEqual(got, want);
}
