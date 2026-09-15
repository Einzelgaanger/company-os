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
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        marketing: ["var(--font-display)"],
        body: ["var(--font-sans)"],
      },
      colors: {
        forest: "#0E1F1A",
        "forest-deep": "#0A1712",
        "forest-hover": "#1A3A2E",
        "forest-soft": "#173028",
        lime: "#D3F36B",
        "lime-bright": "#C8F14A",
        /** Soft lime wash — identity selected/hover, not a page neutral. */
        mint: "#F4FBE3",
        "accent-wash": "#F4FBE3",
        ambient: "#EFEFEE",
        soft: "#F8F8F7",
        hairline: "#E5E5E2",
        ink: "#0E1F1A",
        slate: "#5B6560",
        teal: "#0E1F1A",
        red: "#C23B2E",
        green: "#1A3A2E",
        bg: "#F5F5F3",
        surface: "#FFFFFF",
        border: "rgba(14, 31, 26, 0.1)",
        input: "rgba(14, 31, 26, 0.1)",
        ring: "var(--brand-accent)",
        background: "#F5F5F3",
        foreground: "#0E1F1A",
        primary: {
          DEFAULT: "var(--brand-primary)",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#F8F8F7",
          foreground: "#0E1F1A",
        },
        destructive: {
          DEFAULT: "hsl(4 72% 48%)",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#F8F8F7",
          foreground: "#5B6560",
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
        brand: {
          ink: "var(--brand-ink)",
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
          muted: "var(--brand-muted)",
          mint: "var(--brand-accent-wash)",
          "accent-wash": "var(--brand-accent-wash)",
          lime: "var(--brand-accent)",
          forest: "var(--brand-ink)",
        },
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
        fever: {
          ok: "var(--fever-ok)",
          watch: "var(--fever-watch)",
          act: "var(--fever-act)",
        },
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
