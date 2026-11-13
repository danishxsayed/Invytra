import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Razorpay (payments): orders for one-time payments (credit packs, plan upgrades), plans and
 * subscriptions for plans that renew by themselves, the checkout's signature checks, and
 * webhook signatures. Keys only from .env
 * (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET); never logged.
 */

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: string;
  /** Unix seconds: the current paid period. */
  current_start?: number | null;
  current_end?: number | null;
  notes?: Record<string, string>;
}

export class RazorpayError extends Error {}

/** Razorpay's keys from .env, or null when payments aren't set up. */
export function razorpayKeys(env: NodeJS.ProcessEnv = process.env): RazorpayKeys | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined } : null;
}

export class RazorpayClient {
  constructor(
    private readonly keys: RazorpayKeys,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly base = "https://api.razorpay.com/v1",
  ) {}

  private async call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: { authorization: `Basic ${Buffer.from(`${this.keys.keyId}:${this.keys.keySecret}`).toString("base64")}`, ...(body !== undefined && { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
    if (!res.ok) {
      if (res.status === 401) throw new RazorpayError("Payments aren't set up correctly (the Razorpay keys were refused).");
      throw new RazorpayError(`Razorpay refused (${res.status}${data.error?.description ? `: ${data.error.description.slice(0, 160)}` : ""}).`);
    }
    return data as T;
  }

  /** A one-time payment of `amount` in the currency's smallest unit (cents, paise). */
  createOrder(input: { amount: number; currency: string; receipt: string; notes?: Record<string, string> }): Promise<RazorpayOrder> {
    return this.call("POST", "/orders", { ...input, receipt: input.receipt.slice(0, 40) });
  }

  /** A plan: what a subscription charges every period (monthly or yearly), in cents. */
  createPlan(input: { period: "monthly" | "yearly"; amount: number; currency: string; name: string; notes?: Record<string, string> }): Promise<{ id: string }> {
    return this.call("POST", "/plans", { period: input.period, interval: 1, item: { name: input.name.slice(0, 120), amount: input.amount, currency: input.currency }, notes: input.notes });
  }

  /** A subscription the customer authorises at checkout; it renews by itself. */
  createSubscription(input: { planId: string; totalCount: number; notes?: Record<string, string> }): Promise<RazorpaySubscription> {
    return this.call("POST", "/subscriptions", { plan_id: input.planId, total_count: input.totalCount, customer_notify: 1, notes: input.notes });
  }

  subscription(id: string): Promise<RazorpaySubscription> {
    return this.call("GET", `/subscriptions/${encodeURIComponent(id)}`);
  }

  /** Moves a subscription to another plan: now, or from the next renewal. */
  updateSubscription(id: string, input: { planId: string; at: "now" | "cycle_end" }): Promise<RazorpaySubscription> {
    return this.call("PATCH", `/subscriptions/${encodeURIComponent(id)}`, { plan_id: input.planId, schedule_change_at: input.at, customer_notify: true });
  }

  /** Cancels a subscription, at the end of the paid period or right away. */
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription> {
    return this.call("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
  }

  payment(id: string): Promise<{ id: string; order_id: string; status: string; method?: string; amount: number; currency: string }> {
    return this.call("GET", `/payments/${encodeURIComponent(id)}`);
  }
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The checkout's proof that this payment completed this order. */
export function checkoutSignatureOk(keySecret: string, orderId: string, paymentId: string, signature: string): boolean {
  return same(createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
}

/** The checkout's proof that this payment authorised this subscription. */
export function subscriptionSignatureOk(keySecret: string, subscriptionId: string, paymentId: string, signature: string): boolean {
  return same(createHmac("sha256", keySecret).update(`${paymentId}|${subscriptionId}`).digest("hex"), signature);
}

/** A webhook really came from Razorpay (signed over the raw body). */
export function webhookSignatureOk(webhookSecret: string, rawBody: string, signature: string): boolean {
  return same(createHmac("sha256", webhookSecret).update(rawBody).digest("hex"), signature);
}
