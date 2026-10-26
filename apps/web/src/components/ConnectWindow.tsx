"use client";

import { ArrowLeft, Check, Loader2, Lock, MousePointerClick, RotateCw, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Portal } from "./Portal";
import { connectFinishedAction, startConnectAction } from "@/app/app/accounts/actions";
import { cx } from "./ui";

type Phase = "starting" | "ready" | "saving" | "done" | "error";

interface Props {
  accountId: string;
  label: string;
  onClose: () => void;
}

/**
 * Live LinkedIn login inside the dashboard. The worker runs a real browser
 * for this account and streams its screen here; mouse and keyboard go back.
 * The customer logs in (and does any 2FA) themselves.
 */
export function ConnectWindow({ accountId, label, onClose }: Props) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const viewport = useRef({ width: 1280, height: 800 });
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState("Opening a secure browser…");
  const [url, setUrl] = useState("www.linkedin.com/login");
  const [hasFrame, setHasFrame] = useState(false);
  const [focused, setFocused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const finished = useRef(false);

  const send = useCallback((m: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  // Open the socket (again on "Try again").
  useEffect(() => {
    let cancelled = false;
    finished.current = false;
    setPhase("starting");
    setMessage("Opening a secure browser…");
    setHasFrame(false);

    (async () => {
      const r = await startConnectAction(accountId);
      if (cancelled) return;
      if (!r.ok) {
        setPhase("error");
        setMessage(r.error);
        return;
      }
      const ws = new WebSocket(r.value.url);
      ws.binaryType = "blob";
      wsRef.current = ws;
      let drawing = false;
      let latest: Blob | null = null;

      const draw = async () => {
        if (drawing) return;
        drawing = true;
        while (latest) {
          const blob = latest;
          latest = null;
          try {
            const bmp = await createImageBitmap(blob);
            const c = canvasRef.current;
            if (c) {
              if (c.width !== bmp.width || c.height !== bmp.height) {
                c.width = bmp.width;
                c.height = bmp.height;
              }
              c.getContext("2d")?.drawImage(bmp, 0, 0);
              setHasFrame(true);
            }
            bmp.close();
          } catch {
            /* a broken frame — the next one replaces it */
          }
        }
        drawing = false;
      };

      ws.onmessage = (ev) => {
        if (ev.data instanceof Blob) {
          latest = ev.data; // only the newest frame matters
          void draw();
          return;
        }
        let m: { t: string; phase?: Phase; message?: string; url?: string; width?: number; height?: number };
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.t === "viewport" && m.width && m.height) viewport.current = { width: m.width, height: m.height };
        if (m.t === "url" && m.url) setUrl(m.url);
        if (m.t === "status" && m.phase) {
          setPhase(m.phase);
          setMessage(m.message ?? "");
          if (m.phase === "done" || m.phase === "error") finished.current = true;
          if (m.phase === "done") void connectFinishedAction(accountId).then(() => router.refresh());
        }
      };
      let opened = false;
      ws.onopen = () => {
        opened = true;
      };
      ws.onclose = (ev) => {
        if (!finished.current && !cancelled) {
          finished.current = true;
          setPhase("error");
          const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
          setMessage(
            !opened && local
              ? `Couldn't open the login window (worker refused or not running). Check the \`pnpm worker\` tab for a "Connect:" line.`
              : !opened
                ? "Couldn't open the login window. Please try again in a minute."
                : `The login window closed unexpectedly (code ${ev.code}). Please try again.`,
          );
        }
      };
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [accountId, attempt, router]);

  // Mouse moves are sent at most once per animation frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (pendingMove.current) {
        send({ t: "mouse", type: "move", ...pendingMove.current });
        pendingMove.current = null;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [send]);

  // Wheel needs a non-passive listener to stop the dashboard from scrolling.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = point(e);
      if (p) send({ t: "wheel", ...p, dx: e.deltaX, dy: e.deltaY });
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  });

  // Paste (e.g. from a password manager) goes in as text.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (document.activeElement !== canvasRef.current) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        e.preventDefault();
        send({ t: "text", text: text.slice(0, 2000) });
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [send]);

  // Esc closes only when the browser isn't focused (inside it, Esc goes to LinkedIn).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.activeElement !== canvasRef.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function point(e: { clientX: number; clientY: number }) {
    const c = canvasRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  const button = (b: number) => (b === 1 ? "middle" : b === 2 ? "right" : "left");
  const live = phase === "ready";

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Connect ${label}`}>
      <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm" onClick={phase === "done" || phase === "error" ? onClose : undefined} />
      <div className="relative flex max-h-full w-full max-w-[1100px] animate-fade-up flex-col overflow-hidden rounded-2xl bg-white shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold text-stone-900">Connect {label}</h2>
            <p className="text-[14px] text-stone-500">Log in to LinkedIn as you normally would, including any verification code.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 border-b border-stone-100 bg-stone-50 px-3 py-2">
          <button disabled={!live} onClick={() => send({ t: "nav", to: "back" })} aria-label="Back" className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200/60 disabled:opacity-40">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button disabled={!live} onClick={() => send({ t: "nav", to: "reload" })} aria-label="Reload" className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200/60 disabled:opacity-40">
            <RotateCw className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[14px] text-stone-600">
            <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
            <span className="truncate">{url}</span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-stone-100">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label="LinkedIn login window"
            className={cx("mx-auto block h-auto max-h-[68vh] w-auto max-w-full outline-none", !hasFrame && "invisible", live ? "cursor-default" : "pointer-events-none")}
            style={{ aspectRatio: `${viewport.current.width} / ${viewport.current.height}` }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onContextMenu={(e) => e.preventDefault()}
            onMouseMove={(e) => {
              const p = point(e);
              if (p) pendingMove.current = p;
            }}
            onMouseDown={(e) => {
              canvasRef.current?.focus();
              const p = point(e);
              if (p) send({ t: "mouse", type: "down", ...p, button: button(e.button), clickCount: Math.min(3, e.detail || 1) });
            }}
            onMouseUp={(e) => {
              const p = point(e);
              if (p) send({ t: "mouse", type: "up", ...p, button: button(e.button), clickCount: Math.min(3, e.detail || 1) });
            }}
            onKeyDown={(e) => {
              const mod = e.metaKey || e.ctrlKey;
              if (mod && e.key.toLowerCase() === "v") return; // the paste event sends the text
              if (["Shift", "Control", "Meta", "Alt", "CapsLock"].includes(e.key)) return;
              e.preventDefault();
              send({ t: "key", key: e.key, mods: { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey } });
            }}
          />
          {live && hasFrame && !focused && (
            <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-stone-900/80 px-3 py-1.5 text-[14px] text-white">
              <MousePointerClick className="h-4 w-4" aria-hidden /> Click inside the window to type
            </div>
          )}
          {phase !== "ready" && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/85 p-6 backdrop-blur-sm">
              <div className="max-w-sm text-center">
                {phase === "done" ? (
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-400 text-stone-900 shadow-glow">
                    <Check className="h-6 w-6" strokeWidth={3} aria-hidden />
                  </span>
                ) : phase === "error" ? (
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                    <X className="h-6 w-6" aria-hidden />
                  </span>
                ) : (
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-stone-400" aria-hidden />
                )}
                <p className="mt-4 text-[17px] font-semibold text-stone-900" role="status">
                  {phase === "done" ? "Account connected" : phase === "error" ? "Not connected" : phase === "saving" ? "Almost done" : "Starting"}
                </p>
                <p className="mt-1 text-[15px] text-stone-500">{message}</p>
                {phase === "done" && (
                  <button onClick={onClose} className="mt-5 rounded-lg bg-brand-400 px-4 py-2 text-[15px] font-semibold text-stone-900 shadow-glow hover:bg-brand-300">
                    Done
                  </button>
                )}
                {phase === "error" && (
                  <div className="mt-5 flex justify-center gap-2">
                    <button onClick={() => setAttempt((n) => n + 1)} className="rounded-lg bg-brand-400 px-4 py-2 text-[15px] font-semibold text-stone-900 hover:bg-brand-300">
                      Try again
                    </button>
                    <button onClick={onClose} className="rounded-lg border border-stone-200 px-4 py-2 text-[15px] font-medium text-stone-700 hover:bg-stone-50">
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-stone-100 px-5 py-3 text-[14px] text-stone-500">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          Invytra never stores your password, only the logged-in session, encrypted. The window closes by itself once you're in.
        </div>
      </div>
    </div>
    </Portal>
  );
}
