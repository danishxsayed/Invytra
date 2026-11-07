import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// One .env for the whole repo (the worker reads the same file).
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

// Handwritten cards (@invytra/db) draw with a native module that can't be bundled: load it from
// where the db package installed it.
const fromDb = createRequire(resolve(here, "../../packages/db/package.json"));
const NATIVE = { "@resvg/resvg-js": fromDb.resolve("@resvg/resvg-js") };

/** @type {import('next').NextConfig} */
export default {
  // `pnpm web` (dev) and `pnpm build` must never share a folder — mixing them
  // corrupts it and the dashboard shows a blank page.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "imapflow", "mailparser"],
  poweredByHeader: false,
  webpack(cfg, { isServer }) {
    if (isServer) cfg.externals = [({ request }, cb) => (NATIVE[request] ? cb(null, `commonjs ${NATIVE[request]}`) : cb()), ...[cfg.externals ?? []].flat()];
    return cfg;
  },
  // Lead lists are uploaded as CSV text (up to 5 MB, see LEAD_IMPORT in @invytra/shared).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};
