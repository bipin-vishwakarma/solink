import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "index.ts — Visual Studio Code",
  description: "Encrypted chat, disguised as code.",
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
