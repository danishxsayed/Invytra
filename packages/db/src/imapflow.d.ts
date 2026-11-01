// imapflow ships no types: the little we use.
declare module "imapflow" {
  export class ImapFlow {
    constructor(opts: {
      host: string;
      port: number;
      secure: boolean;
      auth: { user: string; pass: string };
      logger?: false;
      socketTimeout?: number;
      greetingTimeout?: number;
      connectionTimeout?: number;
      tls?: { servername?: string };
    });
    connect(): Promise<void>;
    logout(): Promise<void>;
    close(): void;
    on(event: "error", cb: (e: Error) => void): void;
    list(): Promise<{ path: string; name: string; delimiter?: string; specialUse?: string }[]>;
    mailboxCreate(path: string): Promise<unknown>;
    getMailboxLock(path: string): Promise<{ release(): void }>;
    search(query: Record<string, unknown>, opts?: { uid?: boolean }): Promise<number[] | false>;
    messageFlagsAdd(range: number[], flags: string[], opts?: { uid?: boolean }): Promise<boolean>;
    messageMove(range: number[], destination: string, opts?: { uid?: boolean }): Promise<unknown>;
    mailbox: false | { path: string; uidValidity: bigint; uidNext: number; exists: number };
    fetch(range: number[] | string, query: { uid?: boolean; source?: boolean; envelope?: boolean }, opts?: { uid?: boolean }): AsyncIterable<{ uid: number; source: Buffer }>;
  }
}
