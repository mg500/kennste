import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/components/ui/theme";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kennste?!",
  description: "Das Musikquiz für gesellige Runden – mit deiner Spotify-Musik und euren Handys als Buzzer.",
  // Added to the home screen on an iPhone: full screen like an app
  appleWebApp: { capable: true, title: "Kennste?!", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: DEFAULT_THEME.themeColor,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set before paint by THEME_INIT_SCRIPT, hence suppressHydrationWarning
    <html lang="de" data-theme={DEFAULT_THEME.id} suppressHydrationWarning className={`${bricolage.variable} ${dmSans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
