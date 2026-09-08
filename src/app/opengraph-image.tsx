import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#050507",
          backgroundImage:
            "radial-gradient(ellipse at 70% 30%, rgba(167,139,250,0.28), transparent 55%), radial-gradient(ellipse at 25% 75%, rgba(232,121,249,0.16), transparent 55%)",
        }}
      >
        <div
          style={{
            fontSize: 108,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#f3f0ff",
            fontFamily: "sans-serif",
          }}
        >
          ATRION
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 34,
            color: "#a78bfa",
            fontFamily: "sans-serif",
          }}
        >
          Just build it.
        </div>
      </div>
    ),
    { ...size }
  );
}
