/** Everything the public website says about the business, in one place. */
export const SITE = {
  name: "Invytra",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://invytra.com",
  email: "hello@invytra.com",
  company: "Crawlers Technologies Pvt Ltd",
  companyPlace: "Hubballi, Karnataka, India",
  /** Starting price per sender (see PRICE_TIERS in @invytra/shared for the full list). */
  price: { usd: 29, lowestUsd: 12 },
  trialDays: 14,
  trialSenders: 3,
  /** When competitor prices on /compare were last checked. */
  compareCheckedOn: "October 2026",
};
