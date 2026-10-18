/** Every LinkedIn action Invytra can perform. Mirrors the Prisma ActionType enum. */
export const ACTION_TYPES = [
  "PROFILE_VISIT",
  "CONNECTION_REQUEST",
  "CHECK_CONNECTION",
  "MESSAGE",
  "INBOX_SYNC",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

/** Actions that count toward a daily limit. Checks and inbox syncs are read-only. */
export type LimitedActionType = Extract<ActionType, "PROFILE_VISIT" | "CONNECTION_REQUEST" | "MESSAGE">;

export function isLimitedAction(type: ActionType): type is LimitedActionType {
  return type === "PROFILE_VISIT" || type === "CONNECTION_REQUEST" || type === "MESSAGE";
}
