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

/** Action selectors — filled in during Phase 0 Step 4. */
export const SELECTORS = {} as const;
