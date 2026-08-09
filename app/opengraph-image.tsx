import { ImageResponse } from "next/og";

export const alt = "Solink — end-to-end encrypted chat, disguised as code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "radial-gradient(1000px 600px at 85% -10%, rgba(217,119,87,0.28), transparent 60%), #17150f",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 40 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              background: "linear-gradient(135deg,#d97757,#b5533a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 64,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div style={{ color: "#efe9df", fontSize: 44, fontWeight: 700 }}>Solink</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            color: "#efe9df",
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            maxWidth: 900,
          }}
        >
          <span>Encrypted chat,</span>
          <span>disguised as code.</span>
        </div>
        <div style={{ color: "#a39a8b", fontSize: 34, marginTop: 32 }}>
          End-to-end encrypted · tap-to-reveal · panic mode
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 44,
            alignSelf: "flex-start",
            background: "rgba(217,119,87,0.18)",
            color: "#d97757",
            fontSize: 28,
            padding: "10px 22px",
            borderRadius: 9999,
          }}
        >
          🔒 solink-omega.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
