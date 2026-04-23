import { ImageResponse } from "next/og";

export const alt = "Harry English - angielski z pasją";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 60,
          background: "#073229",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#FFC94A",
          fontFamily: "sans-serif",
          padding: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontSize: 120,
              fontWeight: "bold",
              color: "#FFC94A",
            }}
          >
            H
          </span>
        </div>
        <span
          style={{
            fontWeight: "bold",
            fontSize: 72,
            color: "#FFC94A",
            textAlign: "center",
          }}
        >
          Harry English
        </span>
        <span
          style={{
            fontSize: 36,
            marginTop: 16,
            color: "#ffffff",
            opacity: 0.95,
          }}
        >
          angielski z pasją
        </span>
        <span
          style={{
            fontSize: 24,
            marginTop: 32,
            color: "#ffffff",
            opacity: 0.8,
            textAlign: "center",
          }}
        >
          Szkoła języka angielskiego • Zajęcia dla przedszkolaków, uczniów i dorosłych
        </span>
      </div>
    ),
    {
      ...size,
    }
  );
}
