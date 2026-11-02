"use client";

/** Last resort when even the page frame crashes: the error text and a reload button, no app styles needed. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f4ef", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0 }}>
        <div style={{ background: "#fff", padding: 28, borderRadius: 16, maxWidth: 520, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#57534e" }}>Reload the page. If it keeps happening, send a screenshot of this box to the Invytra team.</p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#fafaf9", padding: 10, borderRadius: 8, fontSize: 12.5 }}>
            {error.message || "Unknown error"}
            {error.digest ? `\n(ref ${error.digest})` : ""}
          </pre>
          <button onClick={() => window.location.reload()} style={{ background: "#c6f432", border: 0, borderRadius: 8, padding: "9px 16px", fontWeight: 600, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
