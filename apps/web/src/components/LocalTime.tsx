"use client";

import { useEffect, useState } from "react";

/** A date in the viewer's own time zone (the server can't know it): shown after the page loads. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => setText(new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })), [iso]);
  return <time dateTime={iso}>{text || "…"}</time>;
}
