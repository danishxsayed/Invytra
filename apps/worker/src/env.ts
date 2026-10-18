import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const bool = z
  .enum(["true", "false", ""])
  .default("")
  .transform((v) => v === "true");

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded"),
  DATA_DIR: z.string().default("./.data"),
  LINKEDIN_BASE_URL: z.string().url().default("https://www.linkedin.com"),
  /** Set to "false" to watch the browser while developing. */
  HEADLESS: z
    .enum(["true", "false", ""])
    .default("")
    .transform((v) => v !== "false"),
  /** DEV ONLY: allow accounts without a proxy. Never enable on a server. */
  ALLOW_NO_PROXY: bool,
});

export type Env = z.infer<typeof envSchema>;

/** Validated environment. Throws with a readable message if .env is incomplete. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment. Fix your .env:\n${issues}`);
  }
  return parsed.data;
}
