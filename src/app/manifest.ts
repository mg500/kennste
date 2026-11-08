import type { MetadataRoute } from "next";
import { DEFAULT_THEME } from "@/components/ui/theme";

/** Lets phones add Kennste?! to the home screen: it then opens full screen, without the browser bar. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kennste?! – das Musikquiz",
    short_name: "Kennste?!",
    description: "Das Musikquiz für gesellige Runden – mit deiner Spotify-Musik und euren Handys als Buzzer.",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: DEFAULT_THEME.themeColor,
    theme_color: DEFAULT_THEME.themeColor,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
