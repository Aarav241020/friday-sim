import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA, no backend. Deploys to Vercel as a plain build (dist/).
export default defineConfig({ plugins: [react()] });
