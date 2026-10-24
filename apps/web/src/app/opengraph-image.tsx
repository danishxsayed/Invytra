import { ImageResponse } from "next/og";

export const alt = "Invytra — LinkedIn outreach at a human pace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview image shown when the site is shared on LinkedIn, WhatsApp, Slack… */
export default function OpengraphImage() {
  const bars = [0.18, 0.42, 0.3, 0.66, 0.5, 0.84, 0.36, 0.72, 0.58];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F5F5EB", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#C4FA13", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 800, color: "#1C1917" }}>
            I
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#1C1917" }}>Invytra</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1, letterSpacing: -2, color: "#1C1917", maxWidth: 900 }}>LinkedIn outreach at a human pace.</div>
          <div style={{ fontSize: 32, color: "#57534E" }}>Safe daily limits, office hours, and it stops when they reply. $29 per account.</div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", height: 40 }}>
          {bars.map((b, i) => (
            <div key={i} style={{ width: 90, height: 10, borderRadius: 999, background: i % 3 === 1 ? "#C4FA13" : i % 3 === 2 ? "#0EA5E9" : "#14B8A6", marginBottom: b * 30 }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
