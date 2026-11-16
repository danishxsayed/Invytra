"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { playMessageSound, unlockSound } from "@/lib/sounds";

/*
 * Every WhatsApp page checks /whatsapp/pulse every few seconds (a plain fetch, outside Next's
 * router, so it never collides with the inbox's own requests): chats with unread messages go on
 * the browser tab (favicon badge and "(3)" in the title) and the sidebar; a new message plays a
 * soft sound (unless turned off in the bell's settings); the bell gets its count.
 */

export interface Pulse {
  unreadChats: number;
  bell: number;
  lastIn: string | null;
}
interface PulseCtx extends Pulse {
  sound: boolean;
  setSound: (on: boolean) => void;
  refresh: () => void;
}

const SOUND_KEY = "invytra_wa_sound";
const Ctx = createContext<PulseCtx>({ unreadChats: 0, bell: 0, lastIn: null, sound: true, setSound: () => {}, refresh: () => {} });
export const usePulse = () => useContext(Ctx);

const readSound = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
};

/* ---------- favicon + title ---------- */

let baseIcon: HTMLImageElement | null = null;
let baseHref: string | null = null;

function iconLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
}

function setFavicon(count: number) {
  const links = iconLinks();
  if (!links.length) return;
  baseHref ??= links[0]!.dataset.base ?? links[0]!.href;
  for (const l of links) l.dataset.base ??= l.href;
  if (!count) {
    for (const l of links) l.href = l.dataset.base!;
    return;
  }
  const draw = () => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      g.drawImage(baseIcon!, 0, 0, 64, 64);
      const text = count > 99 ? "99+" : String(count);
      const r = text.length > 1 ? 21 : 18;
      g.beginPath();
      g.arc(64 - r + 2, r - 2, r, 0, Math.PI * 2);
      g.fillStyle = "#16a34a";
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "#ffffff";
      g.stroke();
      g.fillStyle = "#ffffff";
      g.font = `bold ${text.length > 2 ? 17 : text.length > 1 ? 22 : 26}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, 64 - r + 2, r - 1);
      const url = c.toDataURL("image/png");
      for (const l of iconLinks()) l.href = url;
    } catch {
      // A badge is a nicety.
    }
  };
  if (baseIcon?.complete && baseIcon.naturalWidth) return draw();
  baseIcon = new Image();
  baseIcon.onload = draw;
  baseIcon.src = baseHref;
}

function setTitle(count: number) {
  const plain = document.title.replace(/^\(\d+\+?\)\s*/, "");
  const next = count ? `(${count > 99 ? "99+" : count}) ${plain}` : plain;
  if (document.title !== next) document.title = next;
}

/* ---------- the provider ---------- */

export function PulseProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [p, setP] = useState<Pulse>({ unreadChats: 0, bell: 0, lastIn: null });
  const [sound, setSoundState] = useState(true);
  const last = useRef<string | null | undefined>(undefined);
  const soundOn = useRef(true);
  const inflight = useRef(false);

  const check = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const r = await fetch("/whatsapp/pulse", { cache: "no-store", credentials: "same-origin" });
      if (!r.ok || !r.headers.get("content-type")?.includes("json")) return;
      const next = (await r.json()) as Pulse;
      // A message that came in since the last check (not on the first one, when the page opens).
      if (last.current !== undefined && next.lastIn && (!last.current || next.lastIn > last.current) && soundOn.current) playMessageSound();
      last.current = next.lastIn;
      setP(next);
    } catch {
      // Offline or a deploy in progress: the next check catches up.
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    const on = readSound();
    soundOn.current = on;
    setSoundState(on);
    // Browsers only allow sound after the person has clicked or typed on the page.
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      void check();
      // Every 8 seconds while they look at the page, every 20 in a background tab (for the sound and the tab badge).
      timer = setTimeout(loop, document.visibilityState === "visible" ? 8000 : 20000);
    };
    loop();
    const back = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", back);
    };
  }, [check]);

  // Next sets the title on each page: put the count back after it does.
  useEffect(() => {
    setTitle(p.unreadChats);
    setFavicon(p.unreadChats);
    const t = setTimeout(() => setTitle(p.unreadChats), 300);
    return () => clearTimeout(t);
  }, [p.unreadChats, path]);

  const setSound = useCallback((on: boolean) => {
    soundOn.current = on;
    setSoundState(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    } catch {
      // Private window: it just won't be remembered.
    }
    if (on) {
      unlockSound();
      playMessageSound();
    }
  }, []);
  const refresh = useCallback(() => {
    void check();
  }, [check]);

  return <Ctx.Provider value={{ ...p, sound, setSound, refresh }}>{children}</Ctx.Provider>;
}
