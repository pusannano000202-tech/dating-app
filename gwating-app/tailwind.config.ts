import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Warm Paper × Electric (스펙 v2) ──
        paper: "#FAF7F2",
        backdrop: "#131110",
        ink: "#1B1916",
        muted: "#8E887E",
        line: "rgba(27,25,22,0.08)",
        "electric-from": "#FF3D5A",
        "electric-to": "#FF7A3D",
        lilac: "#C9B8FF",
      },
      backgroundImage: {
        electric: "linear-gradient(120deg,#FF3D5A,#FF7A3D)",
        dusk: "radial-gradient(140% 90% at 80% -10%, #2B2017 0%, #191512 52%)",
        "shine-text":
          "linear-gradient(110deg,#FF3D5A 25%,#FFC2A1 50%,#FF7A3D 75%)",
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "14px",
        lg: "20px",
        card: "24px",
        btn: "18px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 14px 30px rgba(27,25,22,0.07)",
        glow: "0 14px 30px rgba(255,77,61,0.32)",
        ink: "0 14px 28px rgba(27,25,22,0.22)",
        pressed: "0 6px 12px rgba(27,25,22,0.18)",
        frame:
          "0 0 0 10px #2A2520, 0 0 0 11px #45403A, 0 44px 90px rgba(0,0,0,0.65)",
      },
      fontSize: {
        hero: ["32px", { lineHeight: "1.18", fontWeight: "700" }],
        score: ["48px", { lineHeight: "1.0", fontWeight: "800" }],
      },
      // 키프레임 본체는 globals.css에 있다 (.stagger 등 CSS 셀렉터와 공유하기 위함)
      animation: {
        rise: "rise 0.9s cubic-bezier(0.22,1,0.36,1) both",
        drift: "drift 10s ease-in-out infinite alternate",
        "bolt-in": "bolt-in 0.7s cubic-bezier(0.34,1.56,0.64,1) both",
        "glow-breathe": "glow-breathe 3.2s ease-in-out infinite",
        fill: "fill-bar 1.4s cubic-bezier(0.22,1,0.36,1) both",
        shine: "shine 4s linear infinite",
        typing: "typing 1.2s ease-in-out infinite",
        floaty: "floaty 3.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
