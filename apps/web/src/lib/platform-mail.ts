/*
 * Emails Invytra itself sends (password resets, notices…). The mailer lives in @invytra/db so
 * the worker can send too; this file keeps the web app's imports short.
 */
export { platformMailConfigured, platformMailer, resendMailer, type PlatformEmail, type PlatformMailer } from "@invytra/db";
