# Invytra website: images to make

The new home page has 15 image slots. Each one shows a labelled placeholder on the page until its file exists.

**Product screenshots** come from the real app, filled with made-up data by `DEMO_SEED=yes pnpm demo:seed` (log in as demo@invytra.com / demo-password-2026). Retake them whenever the screens change.

**How to add an image:** export it at the size below (2× is fine for sharp screens), name it exactly `<file name>.webp` (or .png / .jpg), put it in `apps/web/public/site/`, and rebuild (`pnpm web`). The placeholder is replaced automatically.

**Style for all images:** light and bright, warm natural light, our lime (#C4FA13) and stone colours as accents, rounded corners are added by the page (export square corners). People should look international (mixed backgrounds, real offices, not posed stock). Product screenshots use clean demo data, never real people's names or photos.

## Hero

| File name | Size (px) | Type | What to make |
|---|---|---|---|
| `hero-dashboard.webp` | 2400 × 1500 | Product screenshot | Real screenshot: a running LinkedIn campaign page from the demo workspace (pnpm demo:seed), 1440×900 at 2×. |

## One workspace

| File name | Size (px) | Type | What to make |
|---|---|---|---|
| `scatter-founder.webp` | 520 × 640 | Photo | Candid photo: a founder working on a laptop in a bright café or co-working space. Natural light, warm tones. Portrait crop. |
| `scatter-whatsapp.webp` | 480 × 590 | Photo | Close-up of a hand holding a phone showing a friendly business chat on WhatsApp. Soft background blur. Portrait crop. |
| `scatter-inbox.webp` | 560 × 420 | UI mockup | Real screenshot, cropped: an open conversation in the Email inbox from the demo workspace. |
| `scatter-team.webp` | 440 × 560 | Photo | Two or three people from different backgrounds, smiling at a laptop in a modern office. Feels international, not stock-posed. |
| `scatter-linkedin.webp` | 520 × 400 | 3D / illustration | Floating 'Invite accepted' notification card with a profile photo, slightly tilted, glossy 3D style in our lime and stone colours. |

## Channels

| File name | Size (px) | Type | What to make |
|---|---|---|---|
| `channel-linkedin.webp` | 1600 × 1200 | Product screenshot | Real screenshot: the LinkedIn dashboard (stats and this week) from the demo workspace, 1280×960 at 2×. |
| `channel-email.webp` | 1600 × 1200 | Product screenshot | Real screenshot: a running Email campaign from the demo workspace, 1280×960 at 2×. |
| `channel-whatsapp.webp` | 1600 × 1200 | UI mockup | A phone showing a WhatsApp Business conversation, next to (or over) the Invytra WhatsApp broadcast screen. Mockup until the app screens exist. |

## Features

| File name | Size (px) | Type | What to make |
|---|---|---|---|
| `bento-inbox.webp` | 1200 × 900 | Product screenshot | Real screenshot: the LinkedIn inbox with one conversation open, from the demo workspace, 1280×960 at 2×. |

## Who it's for

| File name | Size (px) | Type | What to make |
|---|---|---|---|
| `usecase-agencies.webp` | 1400 × 1000 | Photo | An agency team planning client campaigns around a table or whiteboard. Bright, real office. |
| `usecase-sales.webp` | 1400 × 1000 | Photo | A sales rep with a headset at a desk with a laptop, mid-conversation, friendly. |
| `usecase-founders.webp` | 1400 × 1000 | Photo | A startup founder at a home office desk with coffee, early morning light. |
| `usecase-recruiters.webp` | 1400 × 1000 | Photo | A recruiter on a video call with a candidate, laptop in frame, warm and professional. |

## Final call to action

| File name | Size (px) | Type | What to make |
|---|---|---|---|
| `cta-channels.webp` | 1200 × 900 | 3D / illustration | Three glossy 3D objects: LinkedIn, an envelope (email) and a chat bubble (WhatsApp), floating on a transparent background, lit in our lime green. Export as transparent PNG. |

## What we took from the reference sites

| Idea | Seen on | On Invytra |
|---|---|---|
| Centred hero, big headline rising in word by word, product below | Cashfree | Hero: words rise in one after another, the lime underline draws itself, the dashboard leans back and settles flat as you scroll |
| Floating UI cards around the product | Razorpay, Cashfree | Four live-looking cards (invite accepted, new reply, WhatsApp chat, campaign progress) drift at different speeds |
| Logo ribbon | Both | Channel ribbon (Live / Soon) instead of customer logos, since we don't show logos we can't back up yet |
| Big statement with photos scattered around it, moving at different depths | Cashfree ("whole payments stack") | "All your outreach, one calm workspace" with 5 scattered images |
| Product cards that stack while you scroll, with a pill bar at the bottom | Cashfree (Collect / Go Global…), Razorpay (stacked sections) | Channels: LinkedIn, Email, WhatsApp and "More soon" cards stack; the pill bar shows where you are and jumps there |
| Bento grid of small product moments | Cashfree | Inbox, AI writer typing, verification bars, safe-pace chart, cloud running, team |
| Tabs with big photo and an overlay card | Razorpay ("Powering every industry") | "Who it's for": Agencies, Sales teams, Founders, Recruiters; moves on by itself every 7 s, pauses on hover |
| Dark section with a progress rail | Cashfree (developer section) | "Careful by default": each promise lights up as it reaches the middle of the screen |
| FAQ in two columns | Razorpay | Same |

All motion is light (no animation library, nothing heavy to load) and switches off for people who set "reduce motion" on their device. No testimonials or numbers we can't back up.
