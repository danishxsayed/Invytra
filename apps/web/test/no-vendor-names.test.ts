import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hideVendor } from "../src/lib/vendor";

/** Every source file under a folder. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mdx?)$/.test(f) ? [p] : [];
  });
}

describe("Invytra never names the services it runs on", () => {
  it("cleans saved error texts", () => {
    expect(hideVendor("Unipile 422 invalid_recipient")).toBe("LinkedIn connection 422 invalid_recipient");
    expect(hideVendor("Log in on Unipile's page")).toBe("Log in on LinkedIn connection page");
    expect(hideVendor(null)).toBeNull();
  });

  it("has no visible “Unipile” in the app's text", () => {
    const offenders: string[] = [];
    for (const f of [...files(join(__dirname, "../src")), ...files(join(__dirname, "../../worker/src")), ...files(join(__dirname, "../../../packages/shared/src")), ...files(join(__dirname, "../../../packages/db/src"))]) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return; // comments
          // Only inside quotes/backticks or between JSX tags; identifiers like UnipileClient are code.
          const text = line.replace(/\b[\w$]*[Uu]nipile[\w$]*\s*(?=[(<.:=,;)\]}]|$)/g, "").replace(/import .*/, "");
          if (/["'`>][^"'`<]*\bUnipile\b/.test(text)) offenders.push(`${f.split("/apps/").pop() ?? f}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
