/**
 * ALL LinkedIn DOM selectors and page markers live here (CLAUDE.md rule 6),
 * so a LinkedIn UI change is fixed in one file.
 */

/** URL path fragments that identify special LinkedIn pages. */
export const URL_MARKERS = {
  feed: "/feed",
  login: "/login",
  /** Login form posts and legacy login */
  uasLogin: "/uas/login",
  /** Shown to logged-out visitors on profile pages */
  authwall: "/authwall",
  signup: "/signup",
  /** Security challenges, identity verification, and restriction notices */
  checkpoint: "/checkpoint/",
} as const;

/** Lower-case text fragments searched in the page body / title. */
export const TEXT_MARKERS = {
  restricted: [
    "your account has been restricted",
    "your account is temporarily restricted",
    "we've restricted your account",
  ],
  captcha: [
    "let's do a quick security check",
    "security verification",
    "please complete this security check",
  ],
} as const;

/** Elements whose presence means a CAPTCHA widget is on the page. */
export const CAPTCHA_SELECTORS = [
  'iframe[src*="captcha"]',
  'iframe[src*="arkoselabs"]',
  'iframe[title*="captcha" i]',
] as const;

/** Lower-case text that means LinkedIn refused an invitation for a reason we must respect. */
export const INVITE_BLOCK_MARKERS = {
  weeklyLimit: ["reached the weekly invitation limit", "weekly invitation limit"],
  emailRequired: ["to verify this member knows you, please enter their email", "enter their email to connect"],
} as const;

/**
 * Element locators. They use accessible names (aria-labels / roles / visible
 * text) rather than CSS classes — LinkedIn renames classes often, but these
 * labels are what screen readers use and change rarely.
 *
 * Verify against the real site with: pnpm account:probe <label> <profile-url>
 */
export const SELECTORS = {
  profile: {
    /**
     * The profile header card. 2026 layout: a component whose key ends in "Topcard".
     * Older layout fallback: the first <section> in <main>.
     * Scoping avoids "People also viewed" / "More profiles for you".
     */
    topCard: '[componentkey$="Topcard"]',
    topCardFallback: "main section:first-of-type",
    /** h2 in the 2026 layout, h1 before. */
    name: "h1, h2",
    /** Old layout only; the 2026 layout headline is the first plain paragraph after the name. */
    headline: ".text-body-medium",
    /** Connect is a link (2026) or button (older), or hidden under "More". Checked against the name. */
    connectText: /^Connect$/i,
    moreButton: /^More( actions)?$/i,
    /** Shown after an invite was sent. */
    pendingLabel: /^Pending, click to withdraw invitation/i,
    pendingText: /^Pending$/i,
    messageControl: /^Message\b/i,
    /** Connection degree line, e.g. "· 1st" / "· 2nd". */
    firstDegree: /·\s*1st\b/,
  },
  invite: {
    dialog: '[role="dialog"]',
    addNoteButton: /^Add a note$/i,
    noteTextarea: 'textarea[name="message"], [role="dialog"] textarea',
    sendButton: /^Send( invitation| now)?$/i,
    sendWithoutNoteButton: /^Send without a note$/i,
  },
  message: {
    /** The chat overlay that opens after clicking Message. */
    composeBox: '[role="textbox"][contenteditable="true"]',
    sendButton: /^Send$/i,
    closeConversation: /^Close your (conversation|draft)/i,
  },
  inbox: {
    path: "/messaging/",
    /** 2026 layout: <ul aria-label="Conversation List"> with one <li> per conversation. */
    conversationList: /^Conversation List$/i,
    participantName: "h3",
    snippet: "p",
    timestamp: "time",
    /** Text inside an item that marks it unread, e.g. "1 new notification". */
    unreadText: /\bnew (notification|message)s?\b|\bunread\b/i,
    sponsoredPrefix: /^Sponsored\b/i,
  },
} as const;
