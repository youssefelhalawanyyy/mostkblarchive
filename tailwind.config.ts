import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ibm-plex-arabic)", "system-ui", "sans-serif"],
        display: ["var(--font-cairo)", "var(--font-ibm-plex-arabic)", "sans-serif"],
      },
      colors: {
        bg: token("bg"),
        panel: token("panel"),
        raised: token("raised"),
        line: token("line"),
        "line-strong": token("line-strong"),
        fg: token("fg"),
        muted: token("muted"),
        faint: token("faint"),
        inverse: token("inverse"),
        "inverse-fg": token("inverse-fg"),
        sader: token("sader"),
        wared: token("wared"),
        ai: token("ai"),
        ok: token("ok"),
        danger: token("danger"),
      },
      boxShadow: {
        pop: "var(--shadow-pop)",
        card: "var(--shadow-card)",
      },
      minWidth: {
        5: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
