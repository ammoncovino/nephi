import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // relative base so the built site works from any path (e.g. GitHub Pages)
  base: "./",
  plugins: [react()],
});
