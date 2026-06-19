/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Distinct agent colors for the live tail avatars + pipeline.
        intake: "#2563eb",
        discoverer: "#7c3aed",
        parser: "#0891b2",
        analyzer: "#059669",
        orchestrator: "#475569",
        // Clinical brand accent (calm medical teal-blue).
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af",
        },
      },
      fontFamily: {
        sans: [
          "Inter Variable",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        lift: "0 10px 30px -12px rgb(15 23 42 / 0.18)",
        glow: "0 0 0 1px rgb(5 150 105 / 0.25), 0 8px 24px -8px rgb(5 150 105 / 0.35)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.85)" },
          "60%": { opacity: "1", transform: "scale(1.05)" },
          "100%": { transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(37 99 235 / 0.45)" },
          "70%": { boxShadow: "0 0 0 8px rgb(37 99 235 / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(37 99 235 / 0)" },
        },
        "bar-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "100% 50%" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95) translateY(-6px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.23, 1, 0.32, 1) both",
        "fade-in": "fade-in 0.3s cubic-bezier(0.23, 1, 0.32, 1) both",
        "pop-in": "pop-in 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28) both",
        "scale-in": "scale-in 0.16s cubic-bezier(0.23, 1, 0.32, 1) both",
        shimmer: "shimmer 1.5s infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.23, 1, 0.32, 1) infinite",
        "bar-flow": "bar-flow 1.2s linear infinite",
        "spin-slow": "spin 8s linear infinite",
        float: "float-soft 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
