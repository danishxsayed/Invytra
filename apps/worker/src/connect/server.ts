import { verifyConnectTicket, type PrismaClient } from "@invytra/db";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { AccountLock } from "../browser/account-lock.js";
import type { LaunchOptions } from "../browser/launch.js";
import type { SessionStore } from "../browser/types.js";
import { ConnectRefused, LiveLogin } from "./live-login.js";
import { sameProfileElsewhere } from "./same-profile.js";
import { clientMessageSchema, type ServerMessage } from "./protocol.js";

/** Minimal Redis surface: remember a ticket id so each ticket works once. */
export interface TicketStore {
  set(key: string, value: string, ex: "EX", seconds: number, nx: "NX"): Promise<"OK" | null>;
}

export interface ConnectServerDeps {
  prisma: PrismaClient;
  sessions: SessionStore;
  lock: AccountLock;
  tickets: TicketStore;
  encryptionKey: string;
  baseUrl: string;
  launch: LaunchOptions;
  /** Dashboard origins allowed to open a login window, e.g. http://localhost:3000 */
  allowedOrigins: string[];
  maxSessions?: number;
  log?: (msg: string) => void;
  /** Test hooks */
  maxDurationMs?: number;
  idleMs?: number;
}

/**
 * WebSocket server for connecting LinkedIn accounts from the dashboard.
 * GET /connect?ticket=… upgrades to a socket that streams a live login browser.
 */
export function createConnectServer(deps: ConnectServerDeps): { server: Server; active(): number; closeAll(): Promise<void> } {
  const log = deps.log ?? (() => undefined);
  const sessions = new Set<LiveLogin>();
  const server = createServer((_req, res) => {
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const origin = req.headers.origin ?? "";
    if (url.pathname !== "/connect" || !deps.allowedOrigins.includes(origin)) {
      log(
        url.pathname !== "/connect"
          ? `Connect: refused a request for ${url.pathname}`
          : `Connect: refused a login window from "${origin || "unknown"}" — allowed: ${deps.allowedOrigins.join(", ")} (set WEB_ORIGIN in .env)`,
      );
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      onSocket(ws, req, url.searchParams.get("ticket") ?? "").catch((e) => {
        log(`Connect: login window failed: ${e instanceof Error ? e.message : String(e)}`);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ t: "status", phase: "error", message: "Something went wrong opening the login window. Please try again." } satisfies ServerMessage));
          ws.close(1011);
        }
      });
    });
  });

  async function onSocket(ws: WebSocket, _req: IncomingMessage, ticket: string) {
    const send = (m: ServerMessage | Buffer) => {
      if (ws.readyState !== ws.OPEN) return;
      if (Buffer.isBuffer(m)) ws.send(m, { binary: true });
      else ws.send(JSON.stringify(m));
    };
    const refuse = (message: string) => {
      send({ t: "status", phase: "error", message });
      ws.close(1008);
    };

    const claims = await verifyConnectTicket(ticket, deps.encryptionKey);
    if (!claims) log("Connect: refused an expired or invalid login link (check both apps use the same SESSION_ENCRYPTION_KEY)");
    if (!claims) return refuse("This login link has expired. Please try again.");
    if ((await deps.tickets.set(`invytra:connect-ticket:${claims.ticketId}`, "1", "EX", 600, "NX")) !== "OK") {
      return refuse("This login link was already used. Please try again.");
    }
    // Re-check tenancy here too: the account must belong to the ticket's workspace.
    const account = await deps.prisma.linkedinAccount.findFirst({
      where: { id: claims.accountId, workspaceId: claims.workspaceId },
    });
    if (!account) return refuse("Account not found.");
    if (sessions.size >= (deps.maxSessions ?? 3)) return refuse("Too many login windows are open right now. Try again in a minute.");

    const token = await deps.lock.acquire(account.id);
    if (!token) return refuse("This account is busy with an action. Try again in a minute.");

    const live = new LiveLogin({
      account: { id: account.id, label: account.label, proxyUrl: account.proxyUrl, timezone: account.timezone, status: account.status },
      baseUrl: deps.baseUrl,
      launch: deps.launch,
      send,
      backlog: () => ws.bufferedAmount,
      maxDurationMs: deps.maxDurationMs,
      idleMs: deps.idleMs,
      onLoggedIn: async (state, profile) => {
        const twin = await sameProfileElsewhere(deps.prisma, account, profile, deps.baseUrl);
        if (twin) {
          log(`Connect: "${account.label}" is the same LinkedIn profile as "${twin}"; not saved`);
          throw new ConnectRefused(
            `This LinkedIn profile is already connected here as “${twin}”. Each LinkedIn profile can be added once, so this session wasn't saved. Remove this account, or log in with a different LinkedIn profile.`,
          );
        }
        await deps.sessions.save(account.id, state);
        await deps.prisma.linkedinAccount.update({
          where: { id: account.id },
          data: {
            status: "ACTIVE",
            statusReason: null,
            connectedAt: account.connectedAt ?? new Date(),
            ...(profile.name && { profileName: profile.name }),
            ...(profile.url && { profileUrl: profile.url }),
            premiumCheckedAt: new Date(),
            ...(profile.premium != null && { premium: profile.premium }),
            ...(profile.photo && { avatar: Buffer.from(profile.photo.base64, "base64"), avatarType: profile.photo.type, avatarUpdatedAt: new Date() }),
          },
        });
        log(`Connect: "${account.label}" logged in and saved`);
      },
    });
    sessions.add(live);
    log(`Connect: login window opened for "${account.label}"`);

    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const msg = clientMessageSchema.safeParse(parsed);
      if (msg.success) void live.handle(msg.data);
    });
    ws.on("close", () => void live.close());

    try {
      await live.start();
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      log(`Connect: could not open the browser for "${account.label}": ${reason}`);
      await live.fail(/proxy/i.test(reason) ? reason : "Could not open the login browser. Please try again.");
    }
    await live.done;
    sessions.delete(live);
    await deps.lock.release(account.id, token).catch(() => undefined);
    if (ws.readyState === ws.OPEN) ws.close(1000);
  }

  return {
    server,
    active: () => sessions.size,
    async closeAll() {
      await Promise.all([...sessions].map((s) => s.fail("The Invytra worker is restarting. Please try again.")));
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
