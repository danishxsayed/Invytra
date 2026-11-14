/** The channels' real logos (public/channels), for every place a channel is shown. */
export const CHANNEL_IMG: Partial<Record<string, string>> = {
  linkedin: "/channels/linkedin.png",
  whatsapp: "/channels/whatsapp.png",
  email: "/channels/gmail.png",
};
/** Logos without their own tile (drawn on a white one). */
export const BARE_LOGO = new Set(["email"]);
