import { z } from "zod";

/*
 * The questions asked once after sign-up, and the setup plan made from the answers: the
 * workspace overview shows each person the steps that matter for what they told us.
 */

export const ROLES = [
  { id: "founder", label: "Founder or business owner" },
  { id: "sales", label: "Sales or business development" },
  { id: "agency", label: "Agency running outreach for clients" },
  { id: "recruiter", label: "Recruiter or hiring manager" },
  { id: "marketer", label: "Marketer" },
  { id: "freelancer", label: "Freelancer or consultant" },
  { id: "other", label: "Something else" },
] as const;

export const GOALS = [
  { id: "customers", label: "Win new customers" },
  { id: "meetings", label: "Book more meetings and demos" },
  { id: "clients", label: "Get results for my clients" },
  { id: "hiring", label: "Hire people" },
  { id: "investors", label: "Reach investors" },
  { id: "partners", label: "Find partners" },
  { id: "exploring", label: "Just exploring" },
] as const;

/** Channels to pick from (WhatsApp shows as "soon" while it isn't live). */
export const ONBOARDING_CHANNELS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

export const ACCOUNT_COUNTS = [
  { id: "1", label: "Just mine" },
  { id: "2-5", label: "2 to 5" },
  { id: "6-20", label: "6 to 20" },
  { id: "20+", label: "More than 20" },
] as const;

export const HEARD_FROM = [
  { id: "google", label: "Google search" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "youtube", label: "YouTube" },
  { id: "friend", label: "A friend or colleague" },
  { id: "ai", label: "ChatGPT or another AI assistant" },
  { id: "other", label: "Somewhere else" },
] as const;

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];

export const onboardingSchema = z.object({
  role: z.enum(ids(ROLES)).optional(),
  goal: z.enum(ids(GOALS)).optional(),
  channels: z.array(z.enum(ids(ONBOARDING_CHANNELS))).max(3).optional(),
  accounts: z.enum(ids(ACCOUNT_COUNTS)).optional(),
  heardFrom: z.enum(ids(HEARD_FROM)).optional(),
  /** "Somewhere else": where. */
  heardOther: z.string().trim().max(120).optional(),
  /** The setup plan was closed on the overview. */
  planHidden: z.boolean().optional(),
});
export type OnboardingAnswers = z.infer<typeof onboardingSchema>;

/** Stored answers, read safely (anything unknown is dropped). */
export function readAnswers(raw: unknown): OnboardingAnswers {
  const r = onboardingSchema.safeParse(raw ?? {});
  return r.success ? r.data : {};
}

/** What the workspace has done so far (counted from real data). */
export interface SetupProgress {
  linkedinAccounts: number;
  mailboxes: number;
  people: number;
  campaignsLive: number;
  voices: number;
  doNotContact: number;
}

export type SetupStepId = "linkedin" | "mailbox" | "people" | "campaign" | "voice" | "dnc";
export interface SetupStep {
  id: SetupStepId;
  title: string;
  why: string;
  done: boolean;
}

/** The steps for this person, in order, written for what they told us. */
export function setupPlan(a: OnboardingAnswers, p: SetupProgress): SetupStep[] {
  const channels = a.channels?.length ? a.channels : ["linkedin", "email"];
  const agency = a.role === "agency" || a.goal === "clients";
  const many = a.accounts && a.accounts !== "1";
  const who: Record<string, string> = {
    hiring: "the candidates you want to reach",
    investors: "the investors you want to reach",
    partners: "the partners you want to reach",
    clients: "your first client's prospects",
  };
  const target = (a.goal && who[a.goal]) || (agency ? "your first client's prospects" : "the people you want to reach");
  const steps: SetupStep[] = [];

  if (channels.includes("linkedin"))
    steps.push({
      id: "linkedin",
      title: agency ? "Connect your first client's LinkedIn account" : many ? "Connect your LinkedIn accounts" : "Connect your LinkedIn account",
      why: agency
        ? "Each client's account runs on its own, with its own safe daily limits."
        : many
          ? `You said you'll run ${a.accounts === "20+" ? "more than 20" : a.accounts?.replace("-", " to ")} accounts. Start with one; add the rest whenever you like.`
          : "Secure login. Invytra sends on your behalf with safe daily limits.",
      done: p.linkedinAccounts > 0,
    });
  if (channels.includes("email"))
    steps.push({
      id: "mailbox",
      title: "Connect a mailbox for email outreach",
      why: "Use a mailbox on your own domain. Invytra warms it up and keeps sending within safe limits.",
      done: p.mailboxes > 0,
    });
  steps.push({
    id: "people",
    title: `Add ${target}`,
    why:
      a.goal === "hiring"
        ? "Paste a LinkedIn or Sales Navigator search for the roles you're hiring, or upload a CSV."
        : "Paste a LinkedIn or Sales Navigator search, or upload a CSV.",
    done: p.people > 0,
  });
  const campaign: Record<string, string> = {
    meetings: "Launch a campaign that books calls",
    hiring: "Launch a campaign to candidates",
    investors: "Launch a campaign to investors",
    partners: "Launch a campaign to potential partners",
    clients: "Launch your first client campaign",
  };
  steps.push({
    id: "campaign",
    title: (a.goal && campaign[a.goal]) || "Launch your first campaign",
    why:
      a.goal === "hiring"
        ? "A visit, a connection request with a short note, then a friendly follow-up about the role."
        : "Visit, connect, then message. Invytra stops for anyone who replies.",
    done: p.campaignsLive > 0,
  });
  // Personal touches pay off most when the person is the face of the outreach.
  if (channels.includes("linkedin") && !agency && a.role !== "marketer")
    steps.push({
      id: "voice",
      title: "Record your voice for voice notes",
      why: "A one-minute recording. Voice notes with their name stand out in a LinkedIn inbox.",
      done: p.voices > 0,
    });
  if (a.goal === "customers" || a.goal === "meetings" || a.role === "sales" || a.role === "founder")
    steps.push({
      id: "dnc",
      title: "Add your current customers to the do-not-contact list",
      why: "So no campaign on any channel ever pitches someone who already buys from you.",
      done: p.doNotContact > 0,
    });
  return steps;
}

/** A line under the plan's heading, for what they want. */
export function planIntro(a: OnboardingAnswers): string {
  const goal = GOALS.find((g) => g.id === a.goal);
  if (!goal || goal.id === "exploring") return "A few steps to get your first replies.";
  return `Built around what you told us: ${goal.label.toLowerCase()}.`;
}
