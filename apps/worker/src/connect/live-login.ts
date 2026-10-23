import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import { contextOptionsFor, launchBrowser, realUserAgent, type LaunchOptions } from "../browser/launch.js";
import { inspectPage } from "../browser/page-state.js";
import type { BrowserAccount, StorageState } from "../browser/types.js";
import { readProfile } from "../linkedin/profile.js";
import { SHORTCUT_KEYS, SPECIAL_KEYS, displayUrl, type ClientMessage, type Phase, type ServerMessage } from "./protocol.js";

export interface LiveLoginOptions {
  account: BrowserAccount;
  baseUrl: string;
  launch: LaunchOptions;
  /** Send a status message or a JPEG frame to the dashboard. */
  send(msg: ServerMessage | Buffer): void;
  /** Bytes queued on the socket — frames are dropped while the viewer is behind. */
  backlog(): number;
  /** Called once with the logged-in browser state; must encrypt and store it. */
  onLoggedIn(state: StorageState, profile: { name: string | null; url: string | null }): Promise<void>;
  maxDurationMs?: number;
  idleMs?: number;
}

const MAX_BACKLOG = 3 * 1024 * 1024;

/**
 * One live LinkedIn login: a real browser for the account (its own proxy and
 * fingerprint), streamed to the dashboard, driven by the customer's own mouse
 * and keyboard. When LinkedIn shows the feed, the session is handed to
 * onLoggedIn. Nothing typed is stored or logged.
 */
export class LiveLogin {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private cdp?: CDPSession;
  private viewport = { width: 1280, height: 800 };
  private finished = false;
  private lastInput = Date.now();
  private lastUrl = "";
  private timers: NodeJS.Timeout[] = [];
  private resolveDone!: () => void;
  readonly done = new Promise<void>((r) => (this.resolveDone = r));

  constructor(private readonly opts: LiveLoginOptions) {}

  async start(): Promise<void> {
    const { account } = this.opts;
    this.status("starting", "Opening a secure browser…");
    // Always headless: the screen is streamed to the dashboard instead.
    this.browser = await launchBrowser(account, { ...this.opts.launch, headless: true });
    if (this.finished) return void (await this.close()); // the viewer left while the browser was starting
    const ua = await realUserAgent(this.browser);
    const ctxOpts = contextOptionsFor(account, ua);
    this.viewport = ctxOpts.viewport ?? this.viewport;
    this.context = await this.browser.newContext(ctxOpts);
    // A popup (e.g. "Sign in with Google") becomes the streamed page; back to the main page when it closes.
    this.context.on("page", (p) => {
      void this.attach(p);
      p.on("close", () => {
        const main = this.context?.pages()[0];
        if (main && !this.finished) void this.attach(main);
      });
    });
    const page = await this.context.newPage();
    await this.attach(page);
    this.opts.send({ t: "viewport", ...this.viewport });
    await page.goto(new URL("/login", this.opts.baseUrl).toString(), { waitUntil: "domcontentloaded" }).catch(() => undefined);
    this.status("ready", "Log in to LinkedIn below.");

    const maxMs = this.opts.maxDurationMs ?? 10 * 60_000;
    const idleMs = this.opts.idleMs ?? 4 * 60_000;
    this.timers.push(setTimeout(() => void this.fail("The login window timed out. Start again when you're ready."), maxMs));
    this.timers.push(
      setInterval(() => {
        if (Date.now() - this.lastInput > idleMs) void this.fail("Closed after a few minutes without activity.");
        void this.watch();
      }, 1000),
    );
  }

  private status(phase: Phase, message: string, profileName?: string | null) {
    this.opts.send({ t: "status", phase, message, ...(profileName !== undefined && { profileName }) });
  }

  private async attach(page: Page): Promise<void> {
    if (this.finished || !this.context) return;
    if (this.cdp) {
      await this.cdp.send("Page.stopScreencast").catch(() => undefined);
      await this.cdp.detach().catch(() => undefined);
    }
    this.page = page;
    const cdp = await this.context.newCDPSession(page);
    this.cdp = cdp;
    cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
      if (this.cdp === cdp && !this.finished && this.opts.backlog() < MAX_BACKLOG) this.opts.send(Buffer.from(data, "base64"));
      void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 70,
      maxWidth: this.viewport.width,
      maxHeight: this.viewport.height,
    });
  }

  /** Follows the page: address bar updates, and success once the feed shows. */
  private async watch(): Promise<void> {
    const page = this.page;
    if (!page || this.finished) return;
    const url = page.url();
    if (url !== this.lastUrl) {
      this.lastUrl = url;
      this.opts.send({ t: "url", url: displayUrl(url) });
    }
    let path = "";
    try {
      path = new URL(url).pathname;
    } catch {
      return;
    }
    if (!path.startsWith("/feed")) return;
    if ((await inspectPage(page).catch(() => "OK")) !== "OK") return; // still on a check; let the person finish
    await this.succeed(page);
  }

  private async succeed(page: Page): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.clearTimers();
    await this.cdp?.send("Page.stopScreencast").catch(() => undefined);
    this.status("saving", "Logged in. Saving your session securely…");
    try {
      await page.waitForTimeout(3000); // let LinkedIn finish setting cookies
      const state = await this.context!.storageState();
      const profile = await this.readOwnProfile(page);
      await this.opts.onLoggedIn(state, profile);
      this.status("done", profile.name ? `Connected as ${profile.name}.` : "Connected.", profile.name);
    } catch (e) {
      this.status("error", "Logged in, but saving the session failed. Please try again.");
      console.error(`Connect: saving the session failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      await this.close();
    }
  }

  /** Best effort: the account's own name and profile link, for the dashboard. */
  private async readOwnProfile(page: Page): Promise<{ name: string | null; url: string | null }> {
    try {
      await page.goto(new URL("/in/me/", this.opts.baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(1500);
      const p = await readProfile(page);
      const url = /\/in\/[^/]+/.test(new URL(p.url).pathname) ? p.url.split("?")[0]! : null;
      return { name: p.name || null, url };
    } catch {
      return { name: null, url: null };
    }
  }

  async handle(msg: ClientMessage): Promise<void> {
    const page = this.page;
    if (!page || this.finished) return;
    this.lastInput = Date.now();
    const at = (x: number, y: number) => [Math.round(x * this.viewport.width), Math.round(y * this.viewport.height)] as const;
    try {
      switch (msg.t) {
        case "mouse": {
          const [x, y] = at(msg.x, msg.y);
          await page.mouse.move(x, y);
          if (msg.type === "down") await page.mouse.down({ button: msg.button, clickCount: msg.clickCount });
          if (msg.type === "up") await page.mouse.up({ button: msg.button, clickCount: msg.clickCount });
          break;
        }
        case "wheel": {
          const [x, y] = at(msg.x, msg.y);
          await page.mouse.move(x, y);
          await page.mouse.wheel(msg.dx, msg.dy);
          break;
        }
        case "key": {
          const ctrl = msg.mods.ctrl || msg.mods.meta;
          if (msg.key.length === 1 && ctrl) {
            if (SHORTCUT_KEYS.has(msg.key.toLowerCase())) await page.keyboard.press(`ControlOrMeta+${msg.key.toLowerCase()}`);
          } else if (msg.key.length === 1 && !msg.mods.alt) {
            await page.keyboard.type(msg.key);
          } else if (SPECIAL_KEYS.has(msg.key)) {
            await page.keyboard.press(msg.mods.shift && msg.key === "Tab" ? "Shift+Tab" : msg.key);
          }
          break;
        }
        case "text":
          await page.keyboard.insertText(msg.text);
          break;
        case "nav":
          if (msg.to === "back") await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
          if (msg.to === "reload") await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
          if (msg.to === "login") await page.goto(new URL("/login", this.opts.baseUrl).toString(), { waitUntil: "domcontentloaded" }).catch(() => undefined);
          break;
        case "cancel":
          await this.fail("Login cancelled.");
          break;
      }
    } catch {
      // The page navigated mid-input; the next event will land on the new page.
    }
  }

  async fail(message: string): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.status("error", message);
    await this.close();
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  async close(): Promise<void> {
    this.finished = true;
    this.clearTimers();
    await this.browser?.close().catch(() => undefined);
    this.browser = undefined;
    this.resolveDone();
  }
}
