import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One .env for the whole repo (the worker reads the same file).
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

/** @type {import('next').NextConfig} */
export default {
  // `pnpm web` (dev) and `pnpm build` must never share a folder — mixing them
  // corrupts it and the dashboard shows a blank page.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  poweredByHeader: false,
};
