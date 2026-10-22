import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One .env for the whole repo (the worker reads the same file).
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  poweredByHeader: false,
};
