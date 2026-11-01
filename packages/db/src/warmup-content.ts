import { randomBytes } from "node:crypto";

/*
 * Warm-up emails: short, ordinary, link-free messages between pool mailboxes, varied so no
 * two look alike. Each carries a code so the receiving side can find it (in the inbox or in
 * spam) and file it away.
 */

const pick = <T>(list: readonly T[], rand: () => number): T => list[Math.floor(rand() * list.length)]!;

const SUBJECTS = [
  "Quick question about next week",
  "Following up on our chat",
  "Notes from today",
  "Checking in",
  "Thoughts on the plan",
  "About the schedule",
  "Small update",
  "Re-thinking the timeline",
  "Idea for the project",
  "Can we sync this week?",
  "Thanks for the help",
  "One more thing",
];
const OPENERS = ["Hi {name},", "Hello {name},", "Hey {name},", "Hi there,", "Good day {name},"];
const BODIES = [
  "I went through the notes from earlier and most of it looks good. There are a couple of points I'd like to talk through when you have a moment.",
  "Just wanted to check whether the plan for next week still works for you. Happy to move things around if needed.",
  "Thanks again for taking the time yesterday. I've started on the first part and will share where it stands soon.",
  "I had a small idea about how we could make the process a bit simpler. Nothing urgent, but worth a quick chat.",
  "The team finished the first draft today. I'll go through it once more before we share it more widely.",
  "Could you let me know which day suits you better for a short call? Tuesday or Thursday both work on my side.",
  "I've updated the schedule with the changes we discussed. Let me know if anything looks off.",
  "Hope your week is going well. I wanted to share a quick update: things are moving along nicely on our side.",
];
const CLOSERS = ["Thanks,", "Best,", "Cheers,", "Regards,", "Talk soon,", "Thanks a lot,"];
const REPLIES = [
  "Thanks for the update, that sounds good to me.",
  "Got it, thank you. Let's keep it as planned.",
  "Appreciate it! Thursday works better for me.",
  "Thanks, I'll take a look and get back to you.",
  "Sounds great, thanks for letting me know.",
  "Perfect, that works. Talk soon.",
  "Thank you, all clear on my side.",
];

const firstName = (fromName: string) => fromName.trim().split(/\s+/)[0] || "";

/** A fresh code (lower-case letters and digits) that finds this email in the recipient's mailbox. */
export function warmupCode(): string {
  return `wu${randomBytes(6).toString("hex")}`;
}

export function warmupEmail(fromName: string, toName: string, code: string, rand: () => number = Math.random): { subject: string; text: string } {
  const to = firstName(toName);
  const opener = pick(OPENERS, rand).replace(" {name}", to ? ` ${to}` : "");
  const text = `${opener}\n\n${pick(BODIES, rand)}\n\n${pick(CLOSERS, rand)}\n${firstName(fromName) || fromName}\n\nref ${code}`;
  return { subject: pick(SUBJECTS, rand), text };
}

export function warmupReply(subject: string, fromName: string, code: string, rand: () => number = Math.random): { subject: string; text: string } {
  return {
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    text: `${pick(REPLIES, rand)}\n\n${firstName(fromName) || fromName}\n\nref ${code}`,
  };
}
