import type { MetadataRoute } from "next";

/** Lets phones add Kennste?! to the home screen: it then opens full screen, without the browser bar. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kennste?! – das Musikquiz",
    short_name: "Kennste?!",
    description: "Das Musikquiz für gesellige Runden – mit deiner Spotify-Musik und euren Handys als Buzzer.",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
