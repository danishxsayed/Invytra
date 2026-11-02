/**
 * Sets a new password for an Invytra account and signs it out everywhere.
 *   pnpm user:password you@company.com
 * The password is typed in hidden (never on the command line, so it isn't in shell history).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

config({ path: resolve(import.meta.dirname, "../../../.env") });

// One reader for both questions; what's typed is not echoed.
let muted = false;
const out = new Writable({ write: (chunk, _enc, cb) => (muted || process.stdout.write(chunk), cb()) });
const rl = createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY ?? false });
const lines = rl[Symbol.asyncIterator]();
async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  muted = true;
  const { value } = await lines.next();
  muted = false;
  process.stdout.write("\n");
  return String(value ?? "");
}

const email = process.argv[2];
if (!email) {
  console.log("Usage: pnpm user:password you@company.com");
  process.exit(1);
}
const { prisma } = await import("@invytra/db");
const { setPasswordByEmail } = await import("../src/lib/password-reset");
const password = await askHidden(`New password for ${email}: `);
if ((await askHidden("Type it again: ")) !== password) {
  console.log("The two passwords don't match. Nothing changed.");
  rl.close();
  process.exit(1);
}
rl.close();
const r = await setPasswordByEmail(prisma, email, password);
console.log(r.ok ? `Done: ${email} has a new password and was signed out everywhere.` : r.error);
await prisma.$disconnect();
process.exit(r.ok ? 0 : 1);
