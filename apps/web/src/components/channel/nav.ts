import { Activity, FileText, Flame, Inbox, LayoutDashboard, ListChecks, Mail, Megaphone, Rocket, Send, Smartphone, Users } from "lucide-react";

/*
 * Each channel's menu, in one place, drawn by the same sidebar (ChannelShell) so every channel looks
 * the same. "inbox" marks the item that shows the unread / needs-reply count.
 */

export type ShellChannel = "linkedin" | "email" | "whatsapp";
export type NavItem = { href: string; label: string; Icon: typeof Inbox; inbox?: boolean; exact?: boolean };
export type NavSection = { title: string; items: NavItem[] };

/** fill: pages that use the whole screen (an inbox); width: how wide other pages' content may get. */
export const CHANNEL_NAV: Record<ShellChannel, { name: string; home: string; prefix: string; sections: NavSection[]; fill: string[]; width: string }> = {
  linkedin: {
    name: "LinkedIn",
    home: "/app",
    prefix: "/app",
    fill: ["/app/inbox"],
    width: "max-w-5xl",
    sections: [
      {
        title: "LinkedIn",
        items: [
          { href: "/app", label: "Dashboard", Icon: LayoutDashboard, exact: true },
          { href: "/app/inbox", label: "Inbox", Icon: Inbox, inbox: true },
          { href: "/app/campaigns", label: "Campaigns", Icon: Rocket },
          { href: "/app/leads", label: "Leads", Icon: ListChecks },
          { href: "/app/activity", label: "Activity", Icon: Activity },
        ],
      },
      { title: "Setup", items: [{ href: "/app/accounts", label: "LinkedIn accounts", Icon: Users }] },
    ],
  },
  email: {
    name: "Email",
    home: "/email/campaigns",
    prefix: "/email",
    fill: [],
    width: "max-w-6xl",
    sections: [
      {
        title: "Email",
        items: [
          { href: "/email/inbox", label: "Inbox", Icon: Inbox, inbox: true },
          { href: "/email/campaigns", label: "Campaigns", Icon: Send },
          { href: "/email/contacts", label: "Contacts", Icon: Users },
        ],
      },
      {
        title: "Setup",
        items: [
          { href: "/email/mailboxes", label: "Mailboxes", Icon: Mail },
          { href: "/email/warmup", label: "Warm-up", Icon: Flame },
        ],
      },
    ],
  },
  whatsapp: {
    name: "WhatsApp",
    home: "/whatsapp/inbox",
    prefix: "/whatsapp",
    fill: ["/whatsapp/inbox"],
    width: "",
    sections: [
      {
        title: "WhatsApp",
        items: [
          { href: "/whatsapp/inbox", label: "Inbox", Icon: Inbox, inbox: true },
          { href: "/whatsapp/campaigns", label: "Campaigns", Icon: Megaphone },
          { href: "/whatsapp/templates", label: "Templates", Icon: FileText },
          { href: "/whatsapp/contacts", label: "Contacts", Icon: Users },
        ],
      },
      { title: "Setup", items: [{ href: "/whatsapp/number", label: "WhatsApp number", Icon: Smartphone }] },
    ],
  },
};

/** Breadcrumb words for path parts (any channel); ids and anything else read "Details". */
export const CRUMB: Record<string, string> = {
  inbox: "Inbox",
  campaigns: "Campaigns",
  templates: "Templates",
  contacts: "Contacts",
  number: "WhatsApp number",
  new: "New",
  leads: "Leads",
  activity: "Activity",
  accounts: "LinkedIn accounts",
  mailboxes: "Mailboxes",
  warmup: "Warm-up",
  settings: "Settings",
  evidence: "Evidence",
  edit: "Edit",
};
