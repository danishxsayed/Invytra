/**
 * Fills a separate DEMO workspace with made-up data, for website screenshots and sales demos.
 *   DEMO_SEED=yes pnpm --filter @invytra/web demo:seed
 * Log in as demo@invytra.com / demo-password-2026. Every person and company is fictional.
 * It only ever touches the workspace with id "demo-ws" (deleted and rebuilt on each run),
 * and refuses to run without DEMO_SEED=yes so it can't be started by accident.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../.env") });
if (process.env.DEMO_SEED !== "yes") {
  console.log("Refusing to run: set DEMO_SEED=yes (this rebuilds the demo workspace only).");
  process.exit(1);
}
const { prisma } = await import("@invytra/db");
const { DEFAULT_LIMITS, DEFAULT_WORKING_HOURS, DEFAULT_CAMPAIGN_SETTINGS } = await import("@invytra/shared");
const { hashPassword } = await import("../src/lib/password");

const WS = "demo-ws";
const EMAIL = "demo@invytra.com";
const now = new Date();
const DAY = 86400_000;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
/** A time `daysAgo` back, inside office hours (09:00–18:00 UTC), skipping weekends. */
function workTime(daysAgo: number): Date {
  const d = new Date(now.getTime() - daysAgo * DAY);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setTime(d.getTime() - DAY);
  d.setUTCHours(5 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), 0, 0);
  return d > now ? new Date(now.getTime() - 3600_000) : d;
}

const FIRST = ["Priya", "Daniel", "Sara", "Omar", "Lucas", "Aisha", "Mateo", "Hana", "James", "Fatima", "Noah", "Elena", "Kenji", "Amara", "Ravi", "Chloe", "Youssef", "Ingrid", "Arjun", "Leila", "Tom", "Mei", "Diego", "Zara", "Felix", "Nadia", "Ethan", "Sofia", "Karim", "Anya", "Samuel", "Isabel", "Vikram", "Lena", "Hassan", "Julia", "Marco", "Yuki", "Grace", "Tariq"];
const LAST = ["Nair", "Krüger", "Moreau", "Al-Hashimi", "Tanaka", "Rahman", "García", "Sato", "Whitfield", "Haddad", "Bergström", "Rossi", "Okafor", "Mehta", "Laurent", "Kowalski", "Fernandes", "Lindqvist", "Iyer", "Hoffmann", "Cohen", "Chen", "Silva", "Ahmed", "Novak"];
const COMPANIES = ["Brightpath", "Nordwerk", "Lumen Labs", "Gulf Retail Co", "Kitebase", "Orbitly", "Fernway", "Tidewater Health", "Quillsoft", "Saltbox Studio", "Northwind Logistics", "Pinecrest Capital", "Arcade Analytics", "Bluefin Systems", "Maple & Stone", "Verdant AI", "Cobalt Freight", "Harbor Learning", "Sunline Energy", "Atlas Hiring"];
const TITLES = ["Founder & CEO", "Head of Growth", "VP Sales", "Marketing Director", "Co-founder", "Head of Partnerships", "Sales Director", "COO", "Growth Lead", "Head of Talent"];
const PLACES = ["Dubai, UAE", "Berlin, Germany", "London, UK", "Singapore", "Austin, USA", "Bengaluru, India", "Amsterdam, Netherlands", "Toronto, Canada", "Riyadh, Saudi Arabia", "Sydney, Australia", "Paris, France", "Stockholm, Sweden"];

const people = Array.from({ length: 64 }, (_, i) => {
  const first = FIRST[i % FIRST.length]!;
  const last = pick(LAST);
  const company = pick(COMPANIES);
  return {
    first,
    last,
    company,
    title: pick(TITLES),
    place: pick(PLACES),
    slug: `${first}-${last}`.toLowerCase().normalize("NFD").replace(/[^a-z-]/g, "") + `-${(1000 + i * 37).toString(36)}`,
    email: `${first.toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, "")}.com`,
  };
});
const url = (slug: string) => `https://www.linkedin.com/in/${slug}/`;

await prisma.workspace.deleteMany({ where: { id: WS } });
await prisma.user.deleteMany({ where: { email: EMAIL } });
await prisma.workspace.create({ data: { id: WS, name: "Northwind Studio", plan: "vip", channels: ["linkedin", "email"], aiMonthly: 500, verifyMonthly: 1000 } });
// A custom plan big enough for the demo's senders.
await prisma.subscription.create({ data: { workspaceId: WS, plan: "vip", status: "ACTIVE", channels: ["linkedin", "email"], customSenders: { linkedin: 10, email: 10 }, monthlyCredits: 500, startedAt: new Date() } });
const user = await prisma.user.create({ data: { email: EMAIL, name: "Aisha Rahman", passwordHash: await hashPassword("demo-password-2026") } });
await prisma.membership.create({ data: { userId: user.id, workspaceId: WS, role: "OWNER" } });

// LinkedIn accounts (demo only: no session, nothing ever runs on them)
const accounts = await Promise.all(
  [
    ["Aisha Rahman", "Asia/Dubai"],
    ["Daniel Krüger", "Europe/Berlin"],
    ["Sara Moreau", "Europe/London"],
  ].map(([name, tz], i) =>
    prisma.linkedinAccount.create({
      data: {
        id: `demo-acc-${i}`,
        workspaceId: WS,
        label: name!,
        profileName: name,
        proxyUrl: "",
        timezone: tz!,
        status: "ACTIVE",
        engine: "UNIPILE",
        workingHours: DEFAULT_WORKING_HOURS as never,
        limits: DEFAULT_LIMITS as never,
        premium: i === 0,
        connectedAt: new Date(now.getTime() - 40 * DAY),
        lastActiveAt: new Date(now.getTime() - (i + 1) * 600_000),
      },
    }),
  ),
);

// Lead lists
const listA = await prisma.leadList.create({ data: { workspaceId: WS, name: "SaaS founders · UAE & Europe" } });
const listB = await prisma.leadList.create({ data: { workspaceId: WS, name: "Agency owners · UK" } });
const leads = [];
for (const [i, p] of people.entries()) {
  leads.push(
    await prisma.lead.create({
      data: {
        workspaceId: WS,
        listId: i < 44 ? listA.id : listB.id,
        profileUrl: url(p.slug),
        firstName: p.first,
        lastName: p.last,
        company: p.company,
        title: p.title,
        location: p.place,
        degree: i % 5 === 0 ? 3 : 2,
        premium: i % 6 === 0,
        email: i % 4 === 0 ? p.email : null,
        createdAt: new Date(now.getTime() - 16 * DAY),
      },
    }),
  );
}

// Campaigns
const steps = [
  { type: "VISIT", delayDays: 0 },
  { type: "INVITE", delayDays: 1, note: "Hi {firstName}, I enjoy what {company} is building. Would be great to connect." },
  { type: "MESSAGE", delayDays: 1, text: "Thanks for connecting, {firstName}! Quick question: how does {company} find new customers today?" },
  { type: "MESSAGE", delayDays: 4, text: "Hi {firstName}, happy to share how teams like yours book more meetings. Worth a short call?" },
];
const campA = await prisma.campaign.create({
  data: { workspaceId: WS, name: "Q4 founders · UAE & Europe", listId: listA.id, status: "ACTIVE", steps, settings: DEFAULT_CAMPAIGN_SETTINGS as never, startedAt: new Date(now.getTime() - 14 * DAY), leadsSyncedAt: now },
});
const campB = await prisma.campaign.create({
  data: { workspaceId: WS, name: "UK agency owners", listId: listB.id, status: "ACTIVE", steps, settings: DEFAULT_CAMPAIGN_SETTINGS as never, startedAt: new Date(now.getTime() - 9 * DAY), leadsSyncedAt: now },
});
await prisma.campaign.create({ data: { workspaceId: WS, name: "Event follow-up · Dubai summit", status: "DRAFT", steps } });
for (const a of accounts) await prisma.campaignSender.create({ data: { campaignId: campA.id, accountId: a.id } });
await prisma.campaignSender.create({ data: { campaignId: campB.id, accountId: accounts[2]!.id } });

const REPLIES = [
  "Sounds good. Could we talk on Thursday afternoon?",
  "Hi! Yes, happy to chat next week. What times work for you?",
  "Thanks for reaching out. Can you send a short overview first?",
  "Interesting timing, we were just looking at this. Let's talk.",
  "Yes, good timing. Can you share a few customer examples?",
  "Sure, send me a calendar link.",
  "We use something similar today, but I'm open to comparing.",
  "Appreciate it! Looping in our Head of Sales.",
];
let replyIx = 0;
const conversations: { accountId: string; name: string; clId: string; at: Date; text: string; mine: string }[] = [];

for (const [i, lead] of leads.entries()) {
  const camp = i < 44 ? campA : campB;
  const account = i < 44 ? accounts[i % 3]! : accounts[2]!;
  const p = people[i]!;
  const start = i < 44 ? 13 - Math.floor(i / 4) : 8 - Math.floor((i - 44) / 3);
  // How far this person got: most invited, about half connected, some replied.
  const r = rnd();
  const stage = r < 0.08 ? "queued" : r < 0.22 ? "visited" : r < 0.52 ? "waiting" : r < 0.74 ? "messaged" : r < 0.94 ? "replied" : "not_accepted";
  const visitAt = workTime(Math.max(0, start));
  const inviteAt = workTime(Math.max(0, start - 1));
  const connAt = workTime(Math.max(0, start - 2));
  const msgAt = workTime(Math.max(0, start - 3));
  const repAt = new Date(Math.min(now.getTime() - 300_000, msgAt.getTime() + (2 + rnd() * 30) * 3600_000));
  const state =
    stage === "queued" ? "QUEUED" : stage === "visited" ? "IN_PROGRESS" : stage === "waiting" ? "WAITING_ACCEPT" : stage === "messaged" ? "IN_PROGRESS" : stage === "replied" ? "REPLIED" : "NOT_ACCEPTED";
  const cl = await prisma.campaignLead.create({
    data: {
      campaignId: camp.id,
      workspaceId: WS,
      leadId: lead.id,
      accountId: stage === "queued" ? null : account.id,
      profileUrl: lead.profileUrl,
      firstName: p.first,
      lastName: p.last,
      company: p.company,
      title: p.title,
      linkedinName: `${p.first} ${p.last}`,
      degree: lead.degree,
      premium: lead.premium,
      state,
      step: { queued: 0, visited: 1, waiting: 2, messaged: 3, replied: 3, not_accepted: 2 }[stage],
      nextAt: stage === "queued" || stage === "visited" || stage === "messaged" ? new Date(now.getTime() + (1 + rnd() * 20) * 3600_000) : null,
      invitedAt: ["waiting", "messaged", "replied", "not_accepted"].includes(stage) ? inviteAt : null,
      connectedAt: ["messaged", "replied"].includes(stage) ? connAt : null,
      messagedAt: ["messaged", "replied"].includes(stage) ? msgAt : null,
      repliedAt: stage === "replied" ? repAt : null,
      lastActionAt: stage === "queued" ? null : stage === "visited" ? visitAt : ["messaged", "replied"].includes(stage) ? msgAt : inviteAt,
      createdAt: new Date(now.getTime() - (start + 1) * DAY),
    },
  });
  const act = (type: "PROFILE_VISIT" | "CONNECTION_REQUEST" | "MESSAGE" | "CHECK_CONNECTION", at: Date, payload: Record<string, unknown> = {}) =>
    prisma.action.create({ data: { accountId: account.id, type, targetUrl: lead.profileUrl, status: "SUCCEEDED", payload: payload as never, scheduledAt: at, executedAt: at, durationMs: 4000 + Math.floor(rnd() * 9000), campaignLeadId: cl.id, createdAt: at } });
  if (stage !== "queued") await act("PROFILE_VISIT", visitAt, { result: { name: `${p.first} ${p.last}` } });
  if (["waiting", "messaged", "replied", "not_accepted"].includes(stage)) await act("CONNECTION_REQUEST", inviteAt, { note: steps[1]!.note });
  if (["messaged", "replied"].includes(stage)) {
    await act("CHECK_CONNECTION", connAt, { result: { status: "CONNECTED" } });
    const text = steps[2]!.text!.replace("{firstName}", p.first).replace("{company}", p.company);
    await act("MESSAGE", msgAt, { text });
    if (stage === "replied") conversations.push({ accountId: account.id, name: `${p.first} ${p.last}`, clId: cl.id, at: repAt, text: REPLIES[replyIx++ % REPLIES.length]!, mine: text });
  }
}

// Inbox: conversations with replies (a few already answered / done)
for (const [k, c] of conversations.entries()) {
  const answered = k % 3 === 2;
  const conv = await prisma.conversation.create({
    data: {
      accountId: c.accountId,
      participantName: c.name,
      externalId: `demo-chat-${k}`,
      campaignLeadId: c.clId,
      lastMessageText: answered ? "Great, I've sent an invite for Thursday 3pm." : c.text,
      lastFromMe: answered,
      lastMessageAt: answered ? new Date(c.at.getTime() + 3600_000) : c.at,
      unread: !answered && k % 2 === 0,
      doneAt: k % 5 === 4 ? new Date(c.at.getTime() + 7200_000) : null,
      tags: k % 4 === 0 ? ["Interested"] : [],
    },
  });
  const msgs = [
    { fromMe: true, text: c.mine, sentAt: new Date(c.at.getTime() - 20 * 3600_000) },
    { fromMe: false, text: c.text, sentAt: c.at },
    ...(answered ? [{ fromMe: true, text: "Great, I've sent an invite for Thursday 3pm.", sentAt: new Date(c.at.getTime() + 3600_000) }] : []),
  ];
  for (const [j, m] of msgs.entries()) await prisma.conversationMessage.create({ data: { conversationId: conv.id, fromMe: m.fromMe, text: m.text, sentAt: m.sentAt, key: `demo-${k}-${j}` } });
  await prisma.inboxMessage.create({ data: { accountId: c.accountId, linkedinMessageId: `demo-msg-${k}`, fromName: c.name, text: c.text, sentAt: c.at, fetchedAt: c.at, campaignLeadId: c.clId, answeredAt: answered ? new Date(c.at.getTime() + 3600_000) : null } });
}

// Email Outreach: three warmed-up mailboxes, contacts, one running campaign with replies
const mailboxes = await Promise.all(
  ["aisha@northwind-studio.com", "hello@northwind-studio.com", "aisha@trynorthwind.com"].map((email, i) =>
    prisma.emailAccount.create({
      data: {
        workspaceId: WS,
        email,
        fromName: "Aisha Rahman",
        provider: "GOOGLE",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        imapHost: "imap.gmail.com",
        imapPort: 993,
        username: email,
        secret: "demo-not-a-real-password",
        dailyLimit: 30 + i * 5,
        timeZone: "Asia/Dubai",
        warmupEnabled: true,
        warmupStartedAt: new Date(now.getTime() - (24 + i * 6) * DAY),
        lastCheckedAt: new Date(now.getTime() - 3600_000),
        lastReplyCheckAt: new Date(now.getTime() - 300_000),
        createdAt: new Date(now.getTime() - 30 * DAY),
      },
    }),
  ),
);
const emailList = await prisma.emailList.create({ data: { workspaceId: WS, name: "SaaS founders · UAE & Europe" } });
const emailSteps = [
  { subject: "Quick question, {{first_name|there}}", body: "Hi {{first_name|there}},\n\nI noticed {{company_name}} is growing its team. How do you find new customers today?\n\nAisha", delayDays: 0 },
  { subject: "", body: "Hi {{first_name|there}}, just bringing this back to the top of your inbox. Worth a 15-minute call?", delayDays: 3 },
  { subject: "", body: "Last note from me, {{first_name|there}}. Happy to share what's working for teams like {{company_name}}.", delayDays: 5 },
];
const ecamp = await prisma.emailCampaign.create({
  data: { workspaceId: WS, name: "Founders intro · November", status: "ACTIVE", steps: emailSteps as never, launchedAt: new Date(now.getTime() - 10 * DAY), createdAt: new Date(now.getTime() - 11 * DAY) },
});
await prisma.emailCampaign.create({ data: { workspaceId: WS, name: "Webinar invite · December", status: "DRAFT", steps: emailSteps as never } });
for (const m of mailboxes) await prisma.emailCampaignMailbox.create({ data: { campaignId: ecamp.id, emailAccountId: m.id } });
const EMAIL_REPLIES = ["Thanks Aisha, this looks relevant. Can we talk Tuesday?", "Please send pricing and a short deck.", "Sounds useful. Could you send a short overview?", "Interesting! Who else in the region uses it?", "Happy to hop on a call next week."];
let er = 0;
for (const [i, p] of people.entries()) {
  const contact = await prisma.emailContact.create({
    data: { workspaceId: WS, email: p.email + (i >= 20 ? "" : ""), firstName: p.first, lastName: p.last, company: p.company, title: p.title, verification: i % 9 === 0 ? "RISKY" : "VALID", verifiedAt: new Date(now.getTime() - 12 * DAY), vars: { city: p.place.split(",")[0] } },
  }).catch(() => null);
  if (!contact) continue;
  await prisma.emailListMember.create({ data: { listId: emailList.id, contactId: contact.id } });
  if (i >= 48) continue;
  const mb = mailboxes[i % 3]!;
  const r = rnd();
  const status = r < 0.16 ? "REPLIED" : r < 0.2 ? "BOUNCED" : r < 0.3 ? "COMPLETED" : "ACTIVE";
  const sent = status === "COMPLETED" ? 3 : status === "BOUNCED" ? 1 : 1 + Math.floor(rnd() * 2);
  const first = workTime(9 - (i % 9));
  const lead = await prisma.emailLead.create({
    data: {
      workspaceId: WS, campaignId: ecamp.id, contactId: contact.id, email: contact.email, firstName: p.first, lastName: p.last, company: p.company, title: p.title,
      status, stepIndex: sent, emailAccountId: mb.id, threadSubject: `Quick question, ${p.first}`, threadMessageId: `<demo-${i}@northwind-studio.com>`,
      nextAt: status === "ACTIVE" ? new Date(now.getTime() + (2 + rnd() * 60) * 3600_000) : null,
      lastSentAt: first, repliedAt: status === "REPLIED" ? new Date(first.getTime() + 5 * 3600_000) : null,
      reason: status === "BOUNCED" ? "Mailbox doesn't exist" : null, bounceType: status === "BOUNCED" ? "hard" : null,
      createdAt: new Date(now.getTime() - 10 * DAY),
    },
  });
  for (let k = 0; k < sent; k++) {
    const at = new Date(first.getTime() + k * 3 * DAY);
    if (at > now) break;
    await prisma.emailSend.create({ data: { workspaceId: WS, emailAccountId: mb.id, kind: "CAMPAIGN", status: "SENT", toEmail: contact.email, subject: k ? `Re: Quick question, ${p.first}` : `Quick question, ${p.first}`, text: k ? `Hi ${p.first}, just bringing this back to the top of your inbox. Worth a 15-minute call?\n\nAisha` : `Hi ${p.first},\n\nI noticed ${p.company} is growing its team. How do you find new customers today?\n\nAisha`, emailLeadId: lead.id, stepIndex: k, messageId: `<demo-${i}-${k}@northwind-studio.com>`, createdAt: at } });
  }
  if (status === "REPLIED") {
    await prisma.emailReply.create({ data: { workspaceId: WS, emailAccountId: mb.id, emailLeadId: lead.id, kind: "REPLY", fromEmail: contact.email, fromName: `${p.first} ${p.last}`, subject: `Re: Quick question, ${p.first}`, text: EMAIL_REPLIES[er++ % EMAIL_REPLIES.length]!, receivedAt: new Date(first.getTime() + 5 * 3600_000), readAt: er % 2 ? null : now } });
  }
}
// Warm-up traffic between the mailboxes (mostly landing in the inbox)
for (let d = 0; d < 14; d++) {
  for (const [i, m] of mailboxes.entries()) {
    for (let k = 0; k < 6; k++) {
      const to = mailboxes[(i + 1 + (k % 2)) % 3]!;
      const at = new Date(now.getTime() - d * DAY - k * 3600_000);
      await prisma.emailSend.create({ data: { workspaceId: WS, emailAccountId: m.id, toAccountId: to.id, kind: "WARMUP", status: "SENT", toEmail: to.email, subject: "Notes from today", warmupCode: `demo-${d}-${i}-${k}`, landedIn: rnd() < 0.96 ? "INBOX" : "SPAM", checkedAt: at, createdAt: at } });
    }
  }
}

console.log(`Demo workspace ready: ${leads.length} leads, ${conversations.length} replies. Log in as ${EMAIL} / demo-password-2026`);
await prisma.$disconnect();
