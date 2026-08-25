/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        forest: "#0E1F1A",
        "forest-deep": "#0A1712",
        "forest-hover": "#1A3A2E",
        "forest-soft": "#173028",
        lime: "#D3F36B",
        "lime-bright": "#C8F14A",
        mint: "#F4FBE3",
        gold: "#F0C419",
        "gold-wash": "#FFF8E0",
        ambient: "#EEF2EE",
        soft: "#F7FAF6",
        ink: "#0E1F1A",
        slate: "#5A6B7D",
        teal: "#0E1F1A",
        amber: "#8A6A00",
        red: "#C23B2E",
        green: "#1A3A2E",
        bg: "#EEF2EE",
        surface: "#FFFFFF",
        border: "rgba(14, 31, 26, 0.1)",
        input: "rgba(14, 31, 26, 0.1)",
        ring: "var(--brand-accent)", // §7.11 — focus rings, lime's functional job
        background: "#EEF2EE",
        foreground: "#0E1F1A",
        // §7.3: primary is brand-primary (forest). Lime is decorative only and
        // can never be a CTA surface — it is ~1.5:1 on white.
        primary: {
          DEFAULT: "var(--brand-primary)",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#F7FAF6",
          foreground: "#0E1F1A",
        },
        destructive: {
          DEFAULT: "hsl(4 72% 48%)",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#F7FAF6",
          foreground: "#5A6B7D",
        },
        accent: {
          DEFAULT: "var(--brand-accent)",
          foreground: "#0E1F1A",
        },
        popover: {
          DEFAULT: "#FFFFFF",
          foreground: "#0E1F1A",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#0E1F1A",
        },
        // §7.3 brand set — identity and interaction only, never a status
        brand: {
          ink: "var(--brand-ink)",
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
          muted: "var(--brand-muted)",
          clinic: "#D3F36B",
          mint: "#F4FBE3",
          blue: "#0E1F1A",
          "blue-soft": "#E8F0EA",
          credit: "#F0C419",
          "credit-soft": "#FFF8E0",
          lime: "#D3F36B",
          gold: "#F0C419",
          forest: "#0E1F1A",
        },
        // §7.3 status set — flow states only, disjoint from brand. `DEFAULT` is
        // the chart/dot mark, `ink` clears AA on `tint`, `tint` is the chip.
        status: {
          moving: {
            DEFAULT: "var(--status-moving)",
            ink: "var(--status-moving-ink)",
            tint: "var(--status-moving-tint)",
          },
          ready: {
            DEFAULT: "var(--status-ready)",
            ink: "var(--status-ready-ink)",
            tint: "var(--status-ready-tint)",
          },
          waiting: {
            DEFAULT: "var(--status-waiting)",
            ink: "var(--status-waiting-ink)",
            tint: "var(--status-waiting-tint)",
          },
          review: {
            DEFAULT: "var(--status-review)",
            ink: "var(--status-review-ink)",
            tint: "var(--status-review-tint)",
          },
          attention: {
            DEFAULT: "var(--status-attention)",
            ink: "var(--status-attention-ink)",
            tint: "var(--status-attention-tint)",
          },
          done: {
            DEFAULT: "var(--status-done)",
            ink: "var(--status-done-ink)",
            tint: "var(--status-done-tint)",
          },
        },
        // §7.3 fever zones
        fever: {
          ok: "var(--fever-ok)",
          watch: "var(--fever-watch)",
          act: "var(--fever-act)",
        },
      },
      // §7.5 — three families, each with a job. The fourth was dropped: it
      // overlapped Plus Jakarta Sans and earned nothing but load time, so
      // `marketing` is now an alias of the display family.
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
        marketing: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.625rem",
        md: "0.5rem",
        sm: "0.375rem",
        "2xl": "1rem",
      },
      boxShadow: {
        sidebar: "0 8px 28px rgba(8, 20, 16, 0.35)",
        auth: "0 24px 64px rgba(0, 0, 0, 0.35)",
        none: "none",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "soft-rise": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.35s ease-out both",
        "soft-rise": "soft-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
