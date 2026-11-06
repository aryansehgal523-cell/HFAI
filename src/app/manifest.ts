import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HireFlow AI",
    short_name: "HireFlow",
    description: "Real jobs from company career pages, and a tailored XYZ resume for each one.",
    start_url: "/jobs?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F7FB",
    theme_color: "#0F1A2E",
    categories: ["business", "productivity"],
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Search jobs", url: "/jobs", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My tracker", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
