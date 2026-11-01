import type { MetadataRoute } from "next";

// Web app manifest: lets phones and desktops install Listy as an app (home
// screen icon, own window). It opens offline because public/sw.js keeps the
// home page cached. Colours repeat the bg / surface tokens from globals.css
// (a manifest can't read CSS variables).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Listy",
    short_name: "Listy",
    description: "Make and manage simple lists",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#14171c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
