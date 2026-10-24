import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Invytra — LinkedIn outreach at a human pace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview image shown when the site is shared on LinkedIn, WhatsApp, Slack… */
export default async function OpengraphImage() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/logo-128.png"))).toString("base64")}`;
  const font = (w: string) => readFile(join(process.cwd(), `node_modules/geist/dist/fonts/geist-sans/Geist-${w}.ttf`));
  const [regular, bold] = await Promise.all([font("Regular"), font("Bold")]);
  const bars = [0.18, 0.42, 0.3, 0.66, 0.5, 0.84, 0.36, 0.72, 0.58];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F5F5EB", padding: 72, fontFamily: "Geist" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={72} height={72} alt="" />
          <div style={{ fontSize: 44, fontWeight: 700, color: "#1C1917" }}>Invytra</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, letterSpacing: -2, color: "#1C1917", maxWidth: 900 }}>LinkedIn outreach at a human pace.</div>
          <div style={{ fontSize: 32, color: "#57534E" }}>Safe daily limits, office hours, and it stops when they reply. $29 per account.</div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", height: 40 }}>
          {bars.map((b, i) => (
            <div key={i} style={{ width: 90, height: 10, borderRadius: 999, background: i % 3 === 1 ? "#C4FA13" : i % 3 === 2 ? "#0EA5E9" : "#14B8A6", marginBottom: b * 30 }} />
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
