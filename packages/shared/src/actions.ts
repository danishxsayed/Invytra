/** Every LinkedIn action Invytra can perform. Mirrors the Prisma ActionType enum. */
export const ACTION_TYPES = [
  "PROFILE_VISIT",
  "CONNECTION_REQUEST",
  "CHECK_CONNECTION",
  "MESSAGE",
  "INBOX_SYNC",
  "SEARCH_PAGE",
  "LIKE_POST",
  "WITHDRAW_INVITE",
  "REPLY",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

/** The daily limits. Inbox syncs and withdrawals don't count toward any; search pages have their own fixed cap. */
export type LimitedActionType = Extract<ActionType, "PROFILE_VISIT" | "CONNECTION_REQUEST" | "MESSAGE">;

export function isLimitedAction(type: ActionType): type is LimitedActionType {
  return type === "PROFILE_VISIT" || type === "CONNECTION_REQUEST" || type === "MESSAGE";
}

/**
 * Which daily limit an action uses. A connection check opens the person's
 * profile, so LinkedIn sees a profile visit — it counts as one.
 */
export function limitBucket(type: ActionType): LimitedActionType | null {
  // These open the person's profile or their activity page, so LinkedIn sees a visit.
  if (type === "CHECK_CONNECTION" || type === "LIKE_POST" || type === "WITHDRAW_INVITE") return "PROFILE_VISIT";
  return isLimitedAction(type) ? type : null;
}
