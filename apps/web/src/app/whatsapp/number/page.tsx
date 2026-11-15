import { prisma } from "@invytra/db";
import { waLimitLabel, waQuality } from "@invytra/shared";
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { ChannelLogo } from "@/components/ChannelLogo";
import { Card, PageHeader, cx } from "@/components/ui";
import { ConnectWhatsapp } from "@/components/whatsapp/ConnectWhatsapp";
import { CopyField, DisconnectNumber, ProfileForm, ProfilePhoto, RefreshNumber } from "@/components/whatsapp/NumberControls";
import { requireChannel } from "@/lib/auth";
import { getNumber, readProfile, signupConfig } from "@/lib/whatsapp";

export const metadata = { title: "WhatsApp number" };
export const dynamic = "force-dynamic";

const TONE = { green: "text-emerald-700", amber: "text-amber-700", red: "text-rose-700", stone: "text-stone-500" };

const NEED = [
  { icon: ShieldCheck, title: "A Facebook account", sub: "One that can manage your company's Meta Business account (it's made for you if you don't have one)." },
  { icon: ChannelLogoIcon, title: "A phone number for WhatsApp", sub: "A new number, or one you'll move off the WhatsApp app. It can't stay on the app at the same time." },
  { icon: BadgeCheck, title: "Your business details", sub: "Name, website and country. Meta checks the display name people will see." },
];
function ChannelLogoIcon({ className }: { className?: string }) {
  return (
    <span className={className}>
      <ChannelLogo id="whatsapp" size="xs" />
    </span>
  );
}

export default async function WhatsappNumberPage() {
  const me = await requireChannel("whatsapp");
  const config = signupConfig();
  const n = await getNumber(prisma, me.workspace.id);

  if (!n)
    return (
      <div className="space-y-6">
        <PageHeader title="Connect your WhatsApp number" description="Invytra sends through Meta's official WhatsApp Business API, the approved way for businesses to message people at scale." />
        <Card className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h2 className="text-[18px] font-semibold text-stone-900">It takes about 5 minutes</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-stone-600">
              Meta opens a window where you choose (or create) your business, add your number and confirm it with a code by SMS or call. When it closes, your number is ready here.
            </p>
            <ConnectWhatsapp config={config} className="mt-6" />
            <p className="mt-6 text-[13.5px] leading-relaxed text-stone-500">
              WhatsApp only allows messages to people who agreed to hear from you. Invytra tracks consent and opt-outs for you, which keeps your number&apos;s quality high.
            </p>
          </div>
          <ul className="space-y-4">
            <li className="text-[13px] font-semibold uppercase tracking-wider text-stone-400">What you need</li>
            {NEED.map((x) => (
              <li key={x.title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-600">
                  <x.icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span>
                  <span className="block text-[15px] font-medium text-stone-900">{x.title}</span>
                  <span className="block text-[14px] leading-relaxed text-stone-500">{x.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );

  const q = waQuality(n.quality);
  const profile = await readProfile(prisma, me.workspace.id);
  const ok = n.status === "CONNECTED";
  return (
    <div className="space-y-6">
      <PageHeader title="WhatsApp number" description="Your number on Meta's official WhatsApp Business API, and the business profile people see." />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <ChannelLogo id="whatsapp" />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-[20px] font-semibold tracking-tight text-stone-900">{n.displayPhone || "Your number"}</span>
                <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] font-semibold", ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
                  <span className={cx("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} /> {ok ? "Connected" : "Needs attention"}
                </span>
              </p>
              <p className="truncate text-[14px] text-stone-500">
                {n.verifiedName || "Display name pending"}
                {n.nameStatus && n.nameStatus !== "APPROVED" && <> · name {n.nameStatus.toLowerCase().replace(/_/g, " ")}</>}
              </p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="text-[13px] text-stone-500">Quality rating</dt>
              <dd className={cx("text-[15px] font-semibold", TONE[q.tone])}>{q.label}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-stone-500">Messaging limit</dt>
              <dd className="text-[15px] font-semibold text-stone-900">{waLimitLabel(n.messagingTier)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-stone-500">Billing</dt>
              <dd className="text-[15px] font-semibold text-stone-900">{n.creditShared ? "Through Invytra" : "Not attached"}</dd>
            </div>
          </dl>
          <RefreshNumber />
        </div>
        {n.lastError && (
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[14px] text-amber-900 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {n.lastError}
          </p>
        )}
        <p className="mt-5 flex items-start gap-2 text-[14px] text-stone-500">
          {q.tone === "green" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          {q.note} The limit is how many new people you can start chats with each day; Meta raises it as you send good messages.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <h2 className="text-[17px] font-semibold text-stone-900">Business profile</h2>
          <p className="mb-5 mt-1 text-[14px] text-stone-500">What people see when they tap your name in WhatsApp.</p>
          <div className="mb-6 border-b border-stone-100 pb-6">
            <ProfilePhoto photo={profile.photo} name={n.verifiedName} />
          </div>
          <ProfileForm initial={{ about: profile.about, description: profile.description, email: profile.email, address: profile.address, website: profile.website }} />
        </Card>
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="text-[17px] font-semibold text-stone-900">Account details</h2>
          <CopyField label="Phone number ID" value={n.phoneNumberId} />
          <CopyField label="WhatsApp Business Account ID" value={n.wabaId} />
          <p className="text-[13.5px] leading-relaxed text-stone-500">Meta support may ask for these. Your access is kept encrypted and never shown.</p>
          {me.role === "OWNER" && (
            <div className="border-t border-stone-100 pt-4">
              <DisconnectNumber phone={n.displayPhone || "this number"} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
