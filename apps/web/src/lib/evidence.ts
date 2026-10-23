import { existsSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * Failure screenshots are written by the worker under DATA_DIR (repo-relative,
 * default ./.data). The dashboard serves them only from inside that folder.
 */
export function dataDir(): string {
  // `pnpm web` runs in apps/web; the repo root is two levels up.
  const cwd = process.cwd();
  const root = existsSync(join(cwd, "pnpm-workspace.yaml")) ? cwd : resolve(cwd, "../..");
  return resolve(root, process.env.DATA_DIR ?? "./.data");
}

/**
 * The PNG for an action's stored screenshot path (a .png file, or an evidence
 * folder containing page.png) — or null if it's missing or outside `base`.
 */
export function evidenceFile(stored: string | null, base = dataDir()): string | null {
  if (!stored) return null;
  try {
    let file = resolve(stored);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "page.png");
    if (!file.endsWith(".png") || !existsSync(file)) return null;
    const real = realpathSync(file);
    const root = realpathSync(base);
    return real.startsWith(root + sep) ? real : null;
  } catch {
    return null;
  }
}
