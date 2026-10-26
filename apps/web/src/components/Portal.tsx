"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Renders pop-ups on <body> so page animations or overflow never clip them. */
export function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready ? createPortal(children, document.body) : null;
}
