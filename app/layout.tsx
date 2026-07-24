import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://solink-omega.vercel.app"),
  // Browser tab stays disguised as an editor; social/share cards use the real brand.
  title: "index.ts — Visual Studio Code",
  description: "End-to-end encrypted chat, disguised as code.",
  applicationName: "Solink",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Solink",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: "Solink",
    title: "Solink — encrypted chat, disguised as code",
    description:
      "End-to-end encrypted messaging with a Boss Mode that disguises your chats as code.",
    url: "https://solink-omega.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solink — encrypted chat, disguised as code",
    description:
      "End-to-end encrypted messaging with a Boss Mode that disguises your chats as code.",
  },
};

export const viewport: Viewport = {
  themeColor: "#17150f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
