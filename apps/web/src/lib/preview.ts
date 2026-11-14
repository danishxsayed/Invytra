/*
 * Trying a channel before it launches: PREVIEW_CHANNELS (e.g. "whatsapp") opens it on this
 * server, but only for the people in PREVIEW_EMAILS (comma separated). Everyone else still
 * sees "Coming soon". Remove both lines once the channel's status is "live".
 */

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** The channel may be opened in preview on this server (the middleware lets it through). */
export const previewChannel = (id: string, env: Record<string, string | undefined> = process.env) => list(env.PREVIEW_CHANNELS).includes(id);

/** This person may use the channel in preview. */
export const canPreview = (id: string, email: string, env: Record<string, string | undefined> = process.env) => previewChannel(id, env) && list(env.PREVIEW_EMAILS).includes(email.toLowerCase());
