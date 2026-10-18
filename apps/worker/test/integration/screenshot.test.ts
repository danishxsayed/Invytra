import { existsSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { safeScreenshot } from "../../src/browser/screenshot.js";

let server: Server;
let browser: Browser;
let base: string;

beforeAll(async () => {
  // A page whose web font request never finishes — like LinkedIn sometimes.
  server = createServer((req, res) => {
    if (req.url === "/font.woff2") return; // hang forever
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<style>@font-face{font-family:F;src:url(/font.woff2)}body{font-family:F}</style><h1>Hello</h1>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

it("still captures a screenshot when a web font never loads", { timeout: 30_000 }, async () => {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const file = join(await mkdtemp(join(tmpdir(), "shot-")), "a.png");
  const started = Date.now();
  expect(await safeScreenshot(page, file, 2000)).toBe(true);
  expect(existsSync(file) && statSync(file).size > 0).toBe(true);
  expect(Date.now() - started).toBeLessThan(10_000);
});
