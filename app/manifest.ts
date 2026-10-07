import type { MetadataRoute } from "next";

// Installable web app (PWA): "Install" in Chrome / Edge on Windows, macOS and
// Android, "Add to Home Screen" on iPhone. Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ABL Translate",
    short_name: "ABL",
    description: "ABL real-time bilingual transcription and translation",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
