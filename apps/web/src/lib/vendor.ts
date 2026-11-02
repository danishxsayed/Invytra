/**
 * Invytra never shows which services it runs on. Error texts saved before this rule (or
 * passed through from a service) are cleaned here before they're displayed.
 */
export function hideVendor(text: string): string;
export function hideVendor(text: string | null): string | null;
export function hideVendor(text: string | null): string | null {
  return text === null ? null : text.replace(/\bunipile(?:'s)?\b/gi, "LinkedIn connection");
}
