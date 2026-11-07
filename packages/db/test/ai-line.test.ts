import { describe, expect, it } from "vitest";
import { AiLineWriter, cleanAiLine, cleanAiMessage, profileContext } from "../src/ai-line.js";

const now = new Date("2026-10-31T10:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("AI personalisation line", () => {
  it("reads the profile: recent own posts only, and spots hiring", () => {
    const ctx = profileContext(
      {
        provider_id: "P1",
        first_name: "Raj",
        last_name: "Kumar",
        headline: "CTO at Acme Health",
        summary: "Building clinic software.",
        work_experience: [{ company: "Acme Health", position: "CTO", start: "2022-01", end: null }],
        education: [{ school: "IIT Bombay", degree: "B.Tech", field_of_study: "CS" }],
        skills: [{ name: "React" }, { name: "Node.js" }],
      },
      [
        { id: "1", social_id: "s1", text: "We're hiring a React Native developer in Pune!", parsed_datetime: daysAgo(5) },
        { id: "2", social_id: "s2", text: "Someone else's post", is_repost: true, parsed_datetime: daysAgo(2) },
        { id: "3", social_id: "s3", text: "An old thought", parsed_datetime: daysAgo(400) },
      ],
      now,
    );
    expect(ctx.name).toBe("Raj Kumar");
    expect(ctx.posts.map((p) => p.text)).toEqual(["We're hiring a React Native developer in Pune!"]);
    expect(ctx.hiring).toEqual(["We're hiring a React Native developer in Pune!"]);
    expect(ctx.experience[0]).toMatchObject({ title: "CTO", company: "Acme Health", current: true });
    expect(ctx.education[0]).toEqual({ school: "IIT Bombay", degree: "B.Tech, CS" });
    expect(ctx.skills).toEqual(["React", "Node.js"]);
  });

  it("keeps only one clean line within the limit", () => {
    expect(cleanAiLine('{"line":"Saw you\'re hiring a React Native dev in Pune.","signal":"hiring"}', 100)).toEqual({ line: "Saw you're hiring a React Native dev in Pune.", signal: "hiring" });
    expect(cleanAiLine('{"line":"I came across your profile and loved it.","signal":"role"}', 100).line).toBeNull();
    expect(cleanAiLine('{"line":"' + "x".repeat(120) + '","signal":"role"}', 100).line).toBeNull();
    expect(cleanAiLine('{"line":null,"signal":null}', 100)).toEqual({ line: null, signal: null });
    expect(cleanAiLine("not json", 100).line).toBeNull();
    expect(cleanAiLine('{"line":"Hi {firstName}","signal":"role"}', 100).line).toBeNull();
  });

  it("asks OpenAI for JSON with the rules and the person's details", async () => {
    let sent: Record<string, any> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"line":"Your post on hiring React Native devs caught my eye.","signal":"hiring"}' } }] }), { status: 200 });
    }) as typeof fetch;
    const w = new AiLineWriter("sk-test", "gpt-4o-mini", fetchImpl);
    const r = await w.write(profileContext({ provider_id: "P", first_name: "Raj", headline: "CTO" }, [], now), { offer: "Clinic apps", tone: "friendly" }, 150);
    expect(r).toEqual({ line: "Your post on hiring React Native devs caught my eye.", signal: "hiring" });
    expect(sent.model).toBe("gpt-4o-mini");
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.messages[0].content).toMatch(/At most 150 characters/);
    expect(JSON.parse(sent.messages[1].content)).toMatchObject({ sender_offers: "Clinic apps", person: { name: "Raj", headline: "CTO" } });
  });

  it("reports OpenAI errors", async () => {
    const w = new AiLineWriter("bad", "gpt-4o-mini", (async () => new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 })) as typeof fetch);
    await expect(w.write(profileContext({ provider_id: "P" }, [], now), { offer: "x", tone: "friendly" }, 100)).rejects.toThrow(/OpenAI 401: Incorrect API key/);
  });

  it("checks a whole AI-written note: limit, placeholders, new links", () => {
    const o = { guide: "Mention our demo at https://invytra.com/demo", maxChars: 200 };
    expect(cleanAiMessage('{"text":"Hi Ana, saw your post on hiring. Our demo: https://invytra.com/demo"}', o)).toBe("Hi Ana, saw your post on hiring. Our demo: https://invytra.com/demo");
    expect(cleanAiMessage('{"text":"Hi {firstName}, hello"}', o)).toBeNull();
    expect(cleanAiMessage('{"text":"Hi Ana, see https://evil.example"}', o)).toBeNull();
    expect(cleanAiMessage(JSON.stringify({ text: "x".repeat(201) }), o)).toBeNull();
    expect(cleanAiMessage('{"text":"As an AI, I think"}', o)).toBeNull();
    expect(cleanAiMessage("not json", o)).toBeNull();
  });
});
