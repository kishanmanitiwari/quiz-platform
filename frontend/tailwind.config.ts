import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        saffron: "#F59E0B",
        leaf: "#15803D",
        ink: "#172033"
      }
    }
  },
  plugins: []
};

export default config;
