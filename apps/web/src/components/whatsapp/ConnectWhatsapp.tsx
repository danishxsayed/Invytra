"use client";

import { Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { connectWhatsappAction } from "@/app/whatsapp/actions";
import { btn } from "../AccountControls";
import { cx } from "../ui";

/*
 * "Connect WhatsApp": Meta's Embedded Signup popup (Facebook Login for Business). The customer
 * picks or creates their WhatsApp Business account and number in Meta's own window; Meta then
 * gives us a one-time code (the login callback) and the chosen account and number (a message
 * from the popup). With both, the server finishes the connection.
 */

type SignupConfig = { appId: string; configId: string; version: string };
type FB = {
  init: (o: object) => void;
  login: (cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void, o: object) => void;
};
declare global {
  interface Window {
    FB?: FB;
    fbAsyncInit?: () => void;
  }
}

const SDK = "https://connect.facebook.net/en_US/sdk.js";

function loadSdk(cfg: SignupConfig): Promise<FB> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: cfg.appId, autoLogAppEvents: true, xfbml: false, version: cfg.version });
      resolve(window.FB!);
    };
    if (!document.querySelector(`script[src="${SDK}"]`)) {
      const s = document.createElement("script");
      s.src = SDK;
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.onerror = () => reject(new Error("Meta's sign-in couldn't load. Turn off ad blockers for this page and try again."));
      document.body.appendChild(s);
    }
  });
}

export function ConnectWhatsapp({ config, label = "Connect WhatsApp", className }: { config: SignupConfig | null; label?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"popup" | "saving" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const got = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string }>({});

  const finish = useCallback(async () => {
    const { code, wabaId, phoneNumberId } = got.current;
    if (!code || !wabaId || !phoneNumberId) return;
    got.current = {};
    setBusy("saving");
    const r = await connectWhatsappAction({ code, wabaId, phoneNumberId });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg(r.value.warning ? { ok: false, text: `Connected, with a problem: ${r.value.warning}` } : { ok: true, text: "Your WhatsApp number is connected." });
    router.refresh();
  }, [router]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      let host = "";
      try {
        host = new URL(e.origin).hostname;
      } catch {
        return;
      }
      if (!/(^|\.)facebook\.com$/.test(host)) return;
      let data: { type?: string; event?: string; data?: Record<string, string> };
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event?.startsWith("FINISH")) {
        got.current.wabaId = data.data?.waba_id;
        got.current.phoneNumberId = data.data?.phone_number_id;
        if (!got.current.phoneNumberId) {
          setBusy(null);
          setMsg({ ok: false, text: "No phone number was added in Meta's window. Connect again and add a number at the last step." });
          return;
        }
        void finish();
      } else if (data.event === "CANCEL") {
        setBusy(null);
        setMsg({ ok: false, text: "Meta's window was closed before the end. Nothing was connected." });
      } else if (data.event === "ERROR") {
        setBusy(null);
        setMsg({ ok: false, text: `Meta reported a problem: ${data.data?.error_message ?? "unknown error"}` });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finish]);

  const open = async () => {
    if (!config) return;
    setMsg(null);
    setBusy("popup");
    got.current = {};
    try {
      const fb = await loadSdk(config);
      fb.login(
        (r) => {
          const code = r.authResponse?.code;
          if (!code) {
            setBusy((b) => (b === "popup" ? null : b));
            return;
          }
          got.current.code = code;
          void finish();
        },
        { config_id: config.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } },
      );
    } catch (e) {
      setBusy(null);
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Meta's sign-in couldn't open." });
    }
  };

  return (
    <div className={cx("space-y-3", className)}>
      <button type="button" onClick={open} disabled={!config || !!busy} className={cx(btn.primary, "px-5 py-2.5")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}
        {busy === "popup" ? "Finish in Meta's window…" : busy === "saving" ? "Connecting…" : label}
      </button>
      {!config && <p className="text-[14px] text-stone-500">WhatsApp isn&apos;t set up on this server yet (Meta app keys are missing).</p>}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={cx("rounded-lg px-3 py-2 text-[14px]", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
