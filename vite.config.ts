import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/** Rewrite relative og/twitter image paths to absolute URLs (required by WhatsApp/FB). */
function absoluteSocialMeta(siteUrl: string): Plugin {
  const base = siteUrl.replace(/\/$/, "");
  return {
    name: "absolute-social-meta",
    transformIndexHtml(html) {
      if (!base) return html;
      return html
        .replace(
          /(property="og:image(?::secure_url)?"\s+content=")(\/[^"]+)(")/g,
          `$1${base}$2$3`,
        )
        .replace(
          /(name="twitter:image"\s+content=")(\/[^"]+)(")/g,
          `$1${base}$2$3`,
        )
        .replace(/(property="og:url"\s+content=")(\/)(")/, `$1${base}/$3`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl =
    env.VITE_PUBLIC_SITE_URL?.trim() || env.APP_BASE_URL?.trim() || "";

  return {
    plugins: [react(), absoluteSocialMeta(siteUrl)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
    preview: {
      host: true,
      // Render (and similar) proxy on a public hostname; Vite 6 blocks unknown hosts by default.
      allowedHosts: [".onrender.com", "localhost", "127.0.0.1"],
    },
  };
});
