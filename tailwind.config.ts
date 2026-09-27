import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "#E5E9F0",
        background: "#F1F5F9",
        foreground: "#1C2434",
        primary: {
          DEFAULT: "#5750F1",
          foreground: "#FFFFFF",
          soft: "#EEEDFD"
        },
        sidebar: {
          DEFAULT: "#1C2434",
          hover: "#2A3347"
        },
        muted: {
          DEFAULT: "#64748B",
          soft: "#F8FAFC"
        }
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem"
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
