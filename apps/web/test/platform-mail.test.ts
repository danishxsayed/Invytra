import { describe, expect, it } from "vitest";
import { platformMailConfigured, platformMailer, resendMailer } from "../src/lib/platform-mail";

const mail = { to: "a@b.co", subject: "Reset", text: "t", html: "<p>t</p>" };

describe("platform emails", () => {
  it("send through Resend's API", async () => {
    let call: { url: string; init: RequestInit } | null = null;
    const ok = (async (url: string, init: RequestInit) => ((call = { url, init }), new Response(JSON.stringify({ id: "e1" })))) as unknown as typeof fetch;
    await resendMailer("re_123", "Invytra <no-reply@x.co>", ok)(mail);
    expect(call!.url).toBe("https://api.resend.com/emails");
    expect((call!.init.headers as Record<string, string>).authorization).toBe("Bearer re_123");
    expect(JSON.parse(String(call!.init.body))).toEqual({ from: "Invytra <no-reply@x.co>", to: ["a@b.co"], subject: "Reset", html: "<p>t</p>", text: "t" });
    const bad = (async () => new Response(JSON.stringify({ message: "The x.co domain is not verified." }), { status: 403 })) as unknown as typeof fetch;
    await expect(resendMailer("re_1", "f", bad)(mail)).rejects.toThrow("Resend 403: The x.co domain is not verified.");
  });

  it("prefer Resend, fall back to SMTP, or are off", () => {
    expect(platformMailConfigured({})).toBe(false);
    expect(platformMailer({})).toBeNull();
    expect(platformMailConfigured({ RESEND_API_KEY: "re_1" })).toBe(true);
    expect(platformMailConfigured({ PLATFORM_SMTP_HOST: "h", PLATFORM_SMTP_USER: "u", PLATFORM_SMTP_PASS: "p" })).toBe(true);
  });
});
