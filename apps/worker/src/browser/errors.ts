import type { PageState } from "./page-state.js";

export class AccountBusyError extends Error {
  constructor(accountId: string) {
    super(`Account ${accountId} is already in use by another worker`);
    this.name = "AccountBusyError";
  }
}

export class AccountUnavailableError extends Error {
  constructor(accountId: string, status: string) {
    super(`Account ${accountId} is ${status}, not ACTIVE`);
    this.name = "AccountUnavailableError";
  }
}

/** No saved session — a team member must run the login script. */
export class SessionRequiredError extends Error {
  constructor(accountId: string) {
    super(`Account ${accountId} has no saved session. Run: pnpm login <label>`);
    this.name = "SessionRequiredError";
  }
}

/** LinkedIn showed a checkpoint/captcha/restriction/login page. The account is now stopped. */
export class AccountNeedsAttentionError extends Error {
  constructor(
    readonly accountId: string,
    readonly pageState: PageState,
    readonly screenshotPath: string | null,
  ) {
    super(`Account ${accountId} needs attention: LinkedIn showed ${pageState}`);
    this.name = "AccountNeedsAttentionError";
  }
}
