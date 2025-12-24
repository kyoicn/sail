import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { FocusProvider } from "../context/FocusContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sail",
  description: "Interactive Historical Event Map",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <FocusProvider>
          {children}
        </FocusProvider>
        <Analytics />
      </body>
    </html>
  );
}
