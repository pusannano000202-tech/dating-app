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
        primary:           "#ff5a6f",
        "primary-active":  "#e6475d",
        "primary-soft":    "#fff0f2",
        "primary-disabled":"#ffd6dd",
        canvas:            "#ffffff",
        "canvas-warm":     "#fffaf7",
        "surface-soft":    "#f7f7f7",
        ink:               "#222222",
        body:              "#3f3f3f",
        muted:             "#6a6a6a",
        hairline:          "#dddddd",
        "hairline-soft":   "#ebebeb",
        mint:              "#dff8ec",
        "mint-ink":        "#147a55",
        lavender:          "#f0eaff",
        "lavender-ink":    "#5b3ab8",
        sky:               "#eaf5ff",
        "sky-ink":         "#1f6fb2",
        amber:             "#fff3d8",
        "amber-ink":       "#9a6700",
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm:   "8px",
        md:   "14px",
        lg:   "20px",
        card: "16px",
        full: "9999px",
      },
      boxShadow: {
        card:    "rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.10) 0 4px 8px",
        "btn-primary": "0 4px 18px rgba(255,90,111,0.28)",
      },
      fontSize: {
        hero:    ["32px", { lineHeight: "1.18", fontWeight: "700" }],
        score:   ["48px", { lineHeight: "1.0",  fontWeight: "800" }],
      },
    },
  },
  plugins: [],
};

export default config;
