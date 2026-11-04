/*
 * Every image on the public website, in one list. Until a file exists, the page shows a
 * labelled placeholder with this id, size and description (the brief for the designer).
 * To add an image: export it at this size (2× for sharp screens is fine), name it
 * <id>.webp (or .png / .jpg) and put it in apps/web/public/site/. It appears on the next build.
 */

export interface SiteImage {
  /** Section of the page it belongs to (for the brief). */
  section: string;
  w: number;
  h: number;
  /** Alt text for screen readers once the real image is in. */
  alt: string;
  /** What to make. */
  brief: string;
  kind: "Product screenshot" | "Photo" | "3D / illustration" | "UI mockup";
}

export const SITE_IMAGES = {
  "hero-dashboard": {
    section: "Hero",
    w: 2400,
    h: 1500,
    kind: "Product screenshot",
    alt: "Invytra dashboard showing a campaign that runs on LinkedIn, email and WhatsApp",
    brief: "The Invytra dashboard, light theme: one campaign whose steps use LinkedIn, Email and WhatsApp, with reply counts. Clean demo data (no real people). Browser frame optional.",
  },
  "scatter-founder": {
    section: "One workspace",
    w: 520,
    h: 640,
    kind: "Photo",
    alt: "Founder working on a laptop in a bright café",
    brief: "Candid photo: a founder working on a laptop in a bright café or co-working space. Natural light, warm tones. Portrait crop.",
  },
  "scatter-whatsapp": {
    section: "One workspace",
    w: 480,
    h: 590,
    kind: "Photo",
    alt: "A hand holding a phone with a business chat on WhatsApp",
    brief: "Close-up of a hand holding a phone showing a friendly business chat on WhatsApp. Soft background blur. Portrait crop.",
  },
  "scatter-inbox": {
    section: "One workspace",
    w: 560,
    h: 420,
    kind: "UI mockup",
    alt: "A new email reply in the Invytra inbox",
    brief: "Cropped UI card from the Invytra inbox: a new reply with the person's name, company and a short message. Rounded corners, soft shadow, on a light tint.",
  },
  "scatter-team": {
    section: "One workspace",
    w: 440,
    h: 560,
    kind: "Photo",
    alt: "A small sales team smiling at a laptop screen",
    brief: "Two or three people from different backgrounds, smiling at a laptop in a modern office. Feels international, not stock-posed.",
  },
  "scatter-linkedin": {
    section: "One workspace",
    w: 520,
    h: 400,
    kind: "3D / illustration",
    alt: "Notification that a LinkedIn invite was accepted",
    brief: "Floating 'Invite accepted' notification card with a profile photo, slightly tilted, glossy 3D style in our lime and stone colours.",
  },
  "channel-linkedin": {
    section: "Channels",
    w: 1600,
    h: 1200,
    kind: "Product screenshot",
    alt: "LinkedIn campaign steps in Invytra: visit, invite, message, follow up",
    brief: "Invytra LinkedIn campaign builder: Visit → Invite → Message → Follow up, with the daily limits visible. Crop to the useful area.",
  },
  "channel-email": {
    section: "Channels",
    w: 1600,
    h: 1200,
    kind: "Product screenshot",
    alt: "Email campaign in Invytra with several mailboxes and warm-up health",
    brief: "Invytra Email: a campaign using several mailboxes, with warm-up health and sent / replied counts.",
  },
  "channel-whatsapp": {
    section: "Channels",
    w: 1600,
    h: 1200,
    kind: "UI mockup",
    alt: "Phone with a WhatsApp business conversation next to the Invytra broadcast screen",
    brief: "A phone showing a WhatsApp Business conversation, next to (or over) the Invytra WhatsApp broadcast screen. Mockup until the app screens exist.",
  },
  "bento-inbox": {
    section: "Features",
    w: 1200,
    h: 900,
    kind: "Product screenshot",
    alt: "Unified inbox with replies from LinkedIn, email and WhatsApp",
    brief: "Invytra unified inbox: a list of replies, each with its channel icon (LinkedIn, email, WhatsApp), and one conversation open.",
  },
  "usecase-agencies": {
    section: "Who it's for",
    w: 1400,
    h: 1000,
    kind: "Photo",
    alt: "Agency team planning client campaigns",
    brief: "An agency team planning client campaigns around a table or whiteboard. Bright, real office.",
  },
  "usecase-sales": {
    section: "Who it's for",
    w: 1400,
    h: 1000,
    kind: "Photo",
    alt: "Sales rep with a headset at a desk",
    brief: "A sales rep with a headset at a desk with a laptop, mid-conversation, friendly.",
  },
  "usecase-founders": {
    section: "Who it's for",
    w: 1400,
    h: 1000,
    kind: "Photo",
    alt: "Founder working from a home office",
    brief: "A startup founder at a home office desk with coffee, early morning light.",
  },
  "usecase-recruiters": {
    section: "Who it's for",
    w: 1400,
    h: 1000,
    kind: "Photo",
    alt: "Recruiter on a video call with a candidate",
    brief: "A recruiter on a video call with a candidate, laptop in frame, warm and professional.",
  },
  "cta-channels": {
    section: "Final call to action",
    w: 1200,
    h: 900,
    kind: "3D / illustration",
    alt: "LinkedIn, email and WhatsApp icons as glossy 3D objects",
    brief: "Three glossy 3D objects: LinkedIn, an envelope (email) and a chat bubble (WhatsApp), floating on a transparent background, lit in our lime green. Export as transparent PNG.",
  },
} satisfies Record<string, SiteImage>;

export type SiteImageId = keyof typeof SITE_IMAGES;
