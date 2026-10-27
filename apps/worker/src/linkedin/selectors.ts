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

/** Lower-case text on search pages. */
export const SEARCH_MARKERS = {
  /** Free accounts get a monthly "commercial use" allowance of people searches. */
  searchLimit: [
    "you've reached the monthly limit for profile searches",
    "you’ve reached the monthly limit for profile searches",
    "commercial use limit",
  ],
  noResults: ["no results found", "no leads matched your search", "this list is empty"],
  /** Shown instead of Sales Navigator to members without a Sales Navigator plan. */
  noSalesNav: ["start your free trial of sales navigator", "try sales navigator", "sales navigator is not available", "upgrade to sales navigator"],
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
  /** Free accounts get a few custom notes per month; then "Add a note" shows a Premium upsell. */
  noteLimit: ["out of free custom notes", "send unlimited personalized invites"],
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
    /**
     * LinkedIn Premium badge (the gold "in" next to the name). UNVERIFIED on the real 2026 layout:
     * check a Premium profile and fix here if "Premium only" campaigns skip Premium members.
     */
    premiumBadge:
      '[data-test-icon*="premium" i], [aria-label*="Premium member" i], [aria-label="Premium" i], [title*="Premium member" i], .pv-member-badge--for-top-card, .premium-icon',
  },
  invite: {
    /** ARIA dialogs, alert dialogs, and native <dialog> elements (no explicit role attribute). */
    dialog: '[role="dialog"], [role="alertdialog"], dialog[open]',
    /** Text that identifies THE invitation dialog (pages also contain e.g. video-player "dialogs"). */
    dialogText: /add a note|send without a note|invitation|personali[sz]e/i,
    addNoteButton: /^Add a note$/i,
    noteTextarea: 'textarea, [role="textbox"][contenteditable="true"]',
    sendButton: /^Send( invitation| now)?$/i,
    sendWithoutNoteButton: /^Send without a note$/i,
    dismissButton: /^Dismiss$/i,
  },
  message: {
    /** The chat overlay that opens after clicking Message. */
    composeBox: '[role="textbox"][contenteditable="true"]',
    sendButton: /^Send$/i,
    closeConversation: /^Close your (conversation|draft)/i,
  },
  search: {
    /** LinkedIn people search: every result links to /in/<name>. "LinkedIn Member" results have no profile link. */
    profileLink: 'main a[href*="/in/"]',
    /** The visible name inside a result link (the rest is screen-reader text). */
    linkName: 'span[aria-hidden="true"]',
    /** One result, in the 2026 and older layouts. */
    result: 'li, [role="listitem"], [data-chameleon-result-urn], [data-view-name="search-entity-result-universal-template"]',
    hiddenMember: /^LinkedIn Member$/i,
    nextButton: /^Next$/i,
    /** Sales Navigator: each lead links to /sales/lead/<id>,…; fields carry data-anonymize markers. */
    salesLeadLink: 'a[href*="/sales/lead/"]',
    salesName: '[data-anonymize="person-name"]',
    salesTitle: '[data-anonymize="title"]',
    salesCompany: '[data-anonymize="company-name"]',
    salesLocation: '[data-anonymize="location"]',
    /** Sales Navigator loads results as you scroll this panel. */
    salesScroller: '#search-results-container, [data-x--search-results-container], main',
  },
  activity: {
    /** Appended to a profile URL: the person's posts, newest first. */
    path: "recent-activity/all/",
    post: '[data-urn*="urn:li:activity"], [data-id*="urn:li:activity"], [role="article"], article',
    /** "React Like" in the 2026 feed, "Like" before; aria-pressed=true once liked. */
    likeButton: /^(React )?Like\b/i,
  },
  account: {
    /** Upsells LinkedIn shows free members (lower-case). */
    freeMarkers: ["try premium", "reactivate premium", "try for ₹0", "try for $0", "get premium"],
  },
  follow: {
    /**
     * "Follow <name>" on the profile card (button or link), or "Follow" under More.
     * Once followed it reads "Following" / "Unfollow". UNVERIFIED on the real 2026 layout.
     */
    control: /^Follow\b/i,
    done: /^(Following|Unfollow)\b/i,
  },
  withdraw: {
    /** On a profile with a pending invite: the Pending control, or "Withdraw invitation" under More. */
    menuItem: /^Withdraw( invitation)?$/i,
    confirmButton: /^Withdraw$/i,
    dialogText: /withdraw/i,
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
    /**
     * An open conversation (LinkedIn's long-standing msg-s-* classes; check against the real
     * site). Each event row may start with a date heading and a sender/time header, then one
     * or more messages; the other person's messages carry the "--other" class.
     */
    threadEvent: "li.msg-s-message-list__event",
    threadDate: ".msg-s-message-list__time-heading",
    threadTime: ".msg-s-message-group__timestamp",
    threadMessage: ".msg-s-event-listitem",
    threadBody: ".msg-s-event-listitem__body",
    threadOtherClass: "msg-s-event-listitem--other",
    /** The open conversation's message box and Send button (same as the chat overlay). */
    composeBox: '[role="textbox"][contenteditable="true"]',
    sendButton: /^Send$/i,
  },
} as const;
