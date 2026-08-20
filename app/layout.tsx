import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ViewportManager } from "@/components/ViewportManager";

export const metadata: Metadata = {
  metadataBase: new URL("https://solink-omega.vercel.app"),
  title: "Solink — Private Messenger",
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
  viewportFit: "cover",
  // Android: shrink the layout when the on-screen keyboard opens so the
  // composer reflows above it (iOS is handled by ViewportManager).
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('solink:theme')==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}",
          }}
        />
        <ViewportManager />
        {children}
      </body>
    </html>
  );
}
