"use client";

import { Download } from "lucide-react";
import { btn } from "../AccountControls";

/** Saves the page as a PDF through the browser's print dialog. */
export function PrintButton() {
  return (
    <button type="button" className={btn.secondary} onClick={() => window.print()}>
      <Download className="h-4 w-4" aria-hidden /> Download PDF
    </button>
  );
}
