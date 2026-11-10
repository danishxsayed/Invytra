"use client";

import { Loader } from "@googlemaps/js-api-loader";
import { MarkerClusterer, type Renderer } from "@googlemaps/markerclusterer";
import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type Pin = { id: string; n: number; name: string; address: string | null; lat: number; lng: number };

type Props = {
  pins: Pin[];
  selected: Set<string>;
  hovered: string | null;
  active: string | null;
  /** Changes when a card asks the map to show its business. */
  focus: { id: string; tick: number } | null;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
  onToggle: (id: string) => void;
};

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

/** Numbered pin: dark = matching, lime = selected, blue ring = the one open, bigger on hover. */
function pinClass(state: { selected: boolean; hovered: boolean; active: boolean }) {
  const base = "grid place-items-center rounded-full font-bold shadow-md transition-transform duration-150 cursor-pointer select-none";
  const size = state.selected ? "h-9 min-w-9 px-1.5 text-[13px]" : "h-7 min-w-7 px-1 text-[12px]";
  const color = state.selected ? "bg-brand-400 text-stone-900 ring-2 ring-stone-900" : "bg-stone-900 text-white ring-2 ring-white";
  const focus = state.active ? " outline outline-4 outline-sky-400" : "";
  const grow = state.hovered || state.active ? " scale-125" : "";
  return `${base} ${size} ${color}${focus}${grow}`;
}

/**
 * The businesses on a Google map: one numbered marker each (clustered when close together),
 * framed to show them all, kept in step with the cards (hover, open, select).
 */
export function InvyMap(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef(new Map<string, { marker: google.maps.marker.AdvancedMarkerElement; el: HTMLDivElement }>());
  const idOf = useRef(new WeakMap<google.maps.marker.AdvancedMarkerElement, string>());
  const clusterer = useRef<MarkerClusterer | null>(null);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(p);
  latest.current = p;

  // Load Google Maps once.
  useEffect(() => {
    if (!KEY || !box.current) return;
    let gone = false;
    new Loader({ apiKey: KEY, version: "weekly" })
      .importLibrary("maps")
      .then(async () => {
        await google.maps.importLibrary("marker");
        if (gone || !box.current) return;
        map.current = new google.maps.Map(box.current, {
          mapId: MAP_ID,
          center: { lat: 20.6, lng: 78.9 },
          zoom: 4,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        info.current = new google.maps.InfoWindow({ headerDisabled: true });
        map.current.addListener("click", () => info.current?.close());
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      gone = true;
    };
  }, []);

  // Markers for the businesses; frame them all.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    clusterer.current?.clearMarkers();
    for (const { marker } of markers.current.values()) marker.map = null;
    markers.current.clear();
    const list: google.maps.marker.AdvancedMarkerElement[] = [];
    for (const pin of p.pins) {
      const el = document.createElement("div");
      el.textContent = String(pin.n);
      el.setAttribute("aria-label", `${pin.n}. ${pin.name}`);
      el.addEventListener("mouseenter", () => latest.current.onHover(pin.id));
      el.addEventListener("mouseleave", () => latest.current.onHover(null));
      const marker = new google.maps.marker.AdvancedMarkerElement({ position: { lat: pin.lat, lng: pin.lng }, content: el, title: pin.name, gmpClickable: true });
      marker.addListener("click", () => latest.current.onPick(pin.id));
      markers.current.set(pin.id, { marker, el });
      idOf.current.set(marker, pin.id);
      list.push(marker);
    }
    const renderer: Renderer = {
      render: ({ count, position, markers: ms }) => {
        const sel = (ms ?? []).filter((x) => latest.current.selected.has(idOf.current.get(x as google.maps.marker.AdvancedMarkerElement) ?? "")).length;
        const el = document.createElement("div");
        el.className = `grid h-11 w-11 place-items-center rounded-full bg-stone-900/90 text-[13px] font-semibold text-white shadow-lg ring-4 ${sel ? "ring-brand-400" : "ring-stone-900/20"}`;
        el.textContent = String(count);
        el.title = `${count} businesses${sel ? `, ${sel} selected` : ""}: zoom in`;
        return new google.maps.marker.AdvancedMarkerElement({ position, content: el, zIndex: 1000 + count });
      },
    };
    clusterer.current = new MarkerClusterer({ map: m, markers: list, renderer });
    if (p.pins.length === 1) {
      m.setCenter({ lat: p.pins[0]!.lat, lng: p.pins[0]!.lng });
      m.setZoom(15);
    } else if (p.pins.length) {
      const b = new google.maps.LatLngBounds();
      for (const pin of p.pins) b.extend({ lat: pin.lat, lng: pin.lng });
      m.fitBounds(b, 48);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.pins.map((x) => x.id).join(",")]);

  // Marker looks follow hover / selection / the open one.
  useEffect(() => {
    for (const [id, { marker, el }] of markers.current) {
      const st = { selected: p.selected.has(id), hovered: p.hovered === id, active: p.active === id };
      el.className = pinClass(st);
      marker.zIndex = st.active ? 999 : st.hovered ? 998 : st.selected ? 500 : null;
    }
    clusterer.current?.render();
  }, [p.selected, p.hovered, p.active, ready, p.pins]);

  // The open business: a small card on the map with Select.
  useEffect(() => {
    const m = map.current;
    const iw = info.current;
    if (!ready || !m || !iw) return;
    const it = p.active ? markers.current.get(p.active) : null;
    const pin = p.pins.find((x) => x.id === p.active);
    if (!it || !pin) return iw.close();
    const on = p.selected.has(pin.id);
    const card = document.createElement("div");
    card.className = "max-w-[240px] p-1 font-sans";
    const name = document.createElement("p");
    name.className = "text-[14px] font-semibold text-stone-900";
    name.textContent = `${pin.n}. ${pin.name}`;
    card.append(name);
    if (pin.address) {
      const a = document.createElement("p");
      a.className = "mt-0.5 text-[12px] leading-snug text-stone-500";
      a.textContent = pin.address;
      card.append(a);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mt-2 rounded-md px-2.5 py-1 text-[12px] font-semibold ${on ? "bg-brand-400 text-stone-900" : "bg-stone-900 text-white"}`;
    btn.textContent = on ? "Selected ✓" : "Select";
    btn.addEventListener("click", () => latest.current.onToggle(pin.id));
    card.append(btn);
    iw.setContent(card);
    iw.open({ map: m, anchor: it.marker });
  }, [p.active, p.selected, ready, p.pins]);

  // A card asked to show its business: zoom past the clusters to it.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !p.focus) return;
    const pin = p.pins.find((x) => x.id === p.focus!.id);
    if (!pin) return;
    m.panTo({ lat: pin.lat, lng: pin.lng });
    if ((m.getZoom() ?? 0) < 15) m.setZoom(15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus?.tick, ready]);

  if (!KEY || failed)
    return (
      <div className="grid h-full place-items-center bg-stone-100 p-6 text-center">
        <div className="max-w-sm">
          <MapPin className="mx-auto h-8 w-8 text-stone-400" aria-hidden />
          <p className="mt-2 text-[15px] font-medium text-stone-700">{failed ? "The map didn't load." : "The map isn't set up yet."}</p>
          <p className="mt-1 text-[13px] text-stone-500">
            {failed ? "Check the browser key's allowed websites in Google Cloud." : "Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to .env (a browser key for Maps JavaScript API)."} The businesses are still listed alongside.
          </p>
        </div>
      </div>
    );
  return <div ref={box} className="h-full w-full bg-stone-100" aria-label="Map of the businesses found" />;
}
