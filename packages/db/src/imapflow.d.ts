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
  }
}
