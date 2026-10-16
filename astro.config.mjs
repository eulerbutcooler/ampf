// @ts-check
import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: "https://eulerbutcooler.xyz",
  integrations: [mdx()],
  vite: {
    server: {
      // Allow tunnel hosts (e.g. surang) on this domain and its subdomains.
      // A leading dot matches the domain itself and every subdomain.
      allowedHosts: [".eulerbutcooler.xyz"],
    },
  },
});
