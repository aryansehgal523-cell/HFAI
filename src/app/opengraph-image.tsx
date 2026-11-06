import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const alt = "HireFlow AI: real jobs, and a new resume for every one";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card used when any HireFlow page is shared on LinkedIn, WhatsApp, X, etc. */
const font = (w: number) =>
  readFile(path.join(process.cwd(), `node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-${w}-normal.woff`));

export default async function OpengraphImage() {
  const [regular, semibold] = await Promise.all([font(400), font(600)]);
  const bar = (w: number, c: string) => <div style={{ width: w, height: 22, borderRadius: 11, background: c }} />;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0F1A2E", padding: 80, position: "relative", fontFamily: "Plex" }}>
        <div style={{ position: "absolute", top: -160, right: -120, width: 520, height: 520, borderRadius: 520, background: "rgba(51,70,242,0.45)", filter: "blur(80px)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: 14, background: "#1C2742", borderRadius: 16 }}>
              {bar(48, "#3346F2")}
              {bar(60, "#FFB627")}
              {bar(36, "#12B886")}
            </div>
            <div style={{ fontSize: 40, color: "white", fontWeight: 600, display: "flex" }}>
              HireFlow<span style={{ color: "#7685FF" }}>&nbsp;AI</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, lineHeight: 1.08, color: "white", fontWeight: 600, letterSpacing: -2 }}>Real jobs.</div>
            <div style={{ fontSize: 76, lineHeight: 1.08, color: "#C4CBDA", fontWeight: 600, letterSpacing: -2 }}>A new resume for every one.</div>
          </div>
          <div style={{ display: "flex", gap: 28, fontSize: 26, color: "rgba(255,255,255,0.75)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 14, height: 14, borderRadius: 14, background: "#3346F2" }} />What you achieved</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 14, height: 14, borderRadius: 14, background: "#FFB627" }} />How it was measured</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 14, height: 14, borderRadius: 14, background: "#12B886" }} />How you did it</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Plex", data: regular, weight: 400, style: "normal" },
        { name: "Plex", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
