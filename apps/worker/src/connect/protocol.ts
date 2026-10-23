import { z } from "zod";

/**
 * Messages between the dashboard's live login window and the worker.
 * Browser → worker: JSON input events below. Worker → browser: JSON status
 * messages, and screen frames as binary JPEG.
 */
const unit = z.number().min(0).max(1);
const mods = z
  .object({ ctrl: z.boolean(), meta: z.boolean(), alt: z.boolean(), shift: z.boolean() })
  .partial()
  .default({});

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("mouse"),
    type: z.enum(["move", "down", "up"]),
    x: unit,
    y: unit,
    button: z.enum(["left", "right", "middle"]).default("left"),
    clickCount: z.number().int().min(1).max(3).default(1),
  }),
  z.object({ t: z.literal("wheel"), x: unit, y: unit, dx: z.number().min(-5000).max(5000), dy: z.number().min(-5000).max(5000) }),
  z.object({ t: z.literal("key"), key: z.string().min(1).max(32), mods }),
  /** Pasted text (e.g. a password from a password manager). Never logged. */
  z.object({ t: z.literal("text"), text: z.string().min(1).max(2000) }),
  z.object({ t: z.literal("nav"), to: z.enum(["back", "reload", "login"]) }),
  z.object({ t: z.literal("cancel") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type Phase = "starting" | "ready" | "saving" | "done" | "error";

export type ServerMessage =
  | { t: "status"; phase: Phase; message: string; profileName?: string | null }
  | { t: "viewport"; width: number; height: number }
  /** Address bar text: host + path only (no query strings, which can hold tokens). */
  | { t: "url"; url: string };

/** Keys forwarded as key presses; any other multi-character key name is ignored. */
export const SPECIAL_KEYS = new Set([
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  " ",
]);

/** Shortcuts allowed with Ctrl/Cmd: select all, copy, cut, undo. Paste arrives as a "text" message. */
export const SHORTCUT_KEYS = new Set(["a", "c", "x", "z"]);

export function displayUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname}`;
  } catch {
    return "";
  }
}
