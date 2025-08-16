import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  //important: "#root",
  //important: '.koenig-lexical',
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        "mui-sm": "600px",
        "mui-md": "900px",
        "mui-lg": "1200px",
      },
      fontSize: {
        md: "1.125rem", // 18px
      },
    },
  },
  plugins: [],
};

export default config;
