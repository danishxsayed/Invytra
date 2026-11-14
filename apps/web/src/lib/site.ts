/** Everything the public website says about the business, in one place. */
export const SITE = {
  name: "Invytra",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://invytra.com",
  email: "hello@invytra.com",
  company: "Crawlers Technologies Pvt Ltd",
  companyPlace: "Hubballi, Karnataka, India",
  /** Contact page (and payment provider checks): the registered address and a phone number. */
  address: ["Crawlers Technologies Pvt Ltd", "Hubballi, Karnataka", "India"],
  phone: "+91 97387 38578",
  /** Show the "draft under legal review" notice on the legal pages (turn off once reviewed). */
  legalDraft: false,
  trialDays: 7,
  /** When competitor prices on /compare were last checked. */
  compareCheckedOn: "October 2026",
};
