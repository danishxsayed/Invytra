import { describe, expect, it } from "vitest";
import { AiEmailWriter, cleanDrafts } from "../src/lib/ai-email";

const req = { action: "generate" as const, step: 0, variables: ["city"], count: 2, brief: { objective: "Book a call", audience: "Flooring contractors in the US", product: "Lead generation", tone: "friendly" as const, sellingPoints: "", cta: "", length: "short" as const } };

describe("AI email writer", () => {
  it("keeps good drafts and drops ones with links, made-up variables or spam words", () => {
    const raw = JSON.stringify({
      emails: [
        { subject: "jobs in {{city|your area}}", preview: "A quick idea", body: "Hi {{first_name|there}},\n\nWorth a chat?", cta: "Worth a chat?" },
        { subject: "x", preview: "", body: "See https://x.co", cta: "" },
        { subject: "y", preview: "", body: "Hi {{revenue}}", cta: "" },
        { subject: "Act now", preview: "", body: "Limited time offer", cta: "" },
      ],
    });
    expect(cleanDrafts(raw, req)).toEqual([{ subject: "jobs in {{city|your area}}", preview: "A quick idea", body: "Hi {{first_name|there}},\n\nWorth a chat?", cta: "Worth a chat?" }]);
    expect(cleanDrafts("not json", req)).toEqual([]);
  });

  it("keeps follow-ups in the thread (no subject) and the body when only the subject changes", () => {
    const raw = JSON.stringify({ emails: [{ subject: "New subject", preview: "p", body: "Changed body", cta: "" }] });
    expect(cleanDrafts(raw, { ...req, step: 1 })[0]).toMatchObject({ subject: "", body: "Changed body" });
    expect(cleanDrafts(raw, { ...req, action: "subject", current: { subject: "old", body: "Original body" } })[0]).toMatchObject({ subject: "New subject", body: "Original body" });
  });

  it("asks OpenAI with the rules and the brief, and reports its errors", async () => {
    let sent: { messages: { role: string; content: string }[]; response_format: unknown } | null = null;
    const ok = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ emails: [{ subject: "hello {{first_name|there}}", preview: "p", body: "Hi {{first_name|there}},\n\nOpen to a quick call?", cta: "Open to a quick call?" }] }) } }] }));
    }) as unknown as typeof fetch;
    const drafts = await new AiEmailWriter("k", "gpt-4o-mini", ok).write(req);
    expect(drafts).toHaveLength(1);
    expect(sent!.response_format).toEqual({ type: "json_object" });
    expect(sent!.messages[0]!.content).toContain("Never invent numbers");
    expect(sent!.messages[0]!.content).toContain("{{city}}");
    expect(sent!.messages[1]!.content).toContain("Flooring contractors in the US");
    const bad = (async () => new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 })) as unknown as typeof fetch;
    await expect(new AiEmailWriter("k", "m", bad).write(req)).rejects.toThrow("OpenAI 401: Incorrect API key");
  });
});
