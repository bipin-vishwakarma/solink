import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Solink",
    short_name: "Solink",
    description: "End-to-end encrypted chat, disguised as code.",
    start_url: "/",
    display: "standalone",
    background_color: "#17150f",
    theme_color: "#17150f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
