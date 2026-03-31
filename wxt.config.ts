import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: [],
  manifest: {
    name: "UBC Workday - Schedule Tool",
    description: "A tool to make planning for your semester easier.",
    permissions: ["storage"],
    host_permissions: ["https://*.myworkday.com/*", "https://www.ratemyprofessors.com/*"],
    icons: {
      "16": "icon16.png",
      "32": "icon32.png",
      "48": "icon48.png",
      "128": "icon128.png",
    },
    action: {
      default_title: "UBC Workday - Schedule Tool",
    },
  },
  vite: () => ({
    plugins: [react()],
  }),
});
