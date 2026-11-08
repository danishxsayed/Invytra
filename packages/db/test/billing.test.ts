import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RazorpayClient, checkoutSignatureOk, razorpayKeys, webhookSignatureOk } from "../src/razorpay.js";

describe("Razorpay", () => {
  it("reads keys only when both are set", () => {
    expect(razorpayKeys({})).toBeNull();
    expect(razorpayKeys({ RAZORPAY_KEY_ID: "rzp_test_1", RAZORPAY_KEY_SECRET: "s" })).toEqual({ keyId: "rzp_test_1", keySecret: "s", webhookSecret: undefined });
  });

  it("checks checkout and webhook signatures", () => {
    const sig = createHmac("sha256", "secret").update("order_1|pay_1").digest("hex");
    expect(checkoutSignatureOk("secret", "order_1", "pay_1", sig)).toBe(true);
    expect(checkoutSignatureOk("secret", "order_1", "pay_2", sig)).toBe(false);
    expect(checkoutSignatureOk("other", "order_1", "pay_1", sig)).toBe(false);
    const body = '{"event":"order.paid"}';
    expect(webhookSignatureOk("wh", body, createHmac("sha256", "wh").update(body).digest("hex"))).toBe(true);
    expect(webhookSignatureOk("wh", body + " ", createHmac("sha256", "wh").update(body).digest("hex"))).toBe(false);
  });

  it("creates orders with basic auth and explains refusals", async () => {
    const calls: { url: string; auth: string | null; body: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("authorization"), body: String(init.body) });
      return calls.length === 1 ? new Response(JSON.stringify({ id: "order_9", amount: 1000, currency: "USD", status: "created" })) : new Response(JSON.stringify({ error: { description: "Authentication failed" } }), { status: 401 });
    }) as unknown as typeof fetch;
    const rp = new RazorpayClient({ keyId: "rzp_test_1", keySecret: "s" }, fake);
    expect(await rp.createOrder({ amount: 1000, currency: "USD", receipt: "p1" })).toMatchObject({ id: "order_9" });
    expect(calls[0]!.auth).toBe(`Basic ${Buffer.from("rzp_test_1:s").toString("base64")}`);
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ amount: 1000, currency: "USD", receipt: "p1" });
    await expect(rp.createOrder({ amount: 1, currency: "USD", receipt: "x" })).rejects.toThrow(/keys were refused/);
  });
});
