import type { Metadata } from "next";
import type { ReactNode } from "react";

import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Toaster } from "@/components/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Agent",
  description:
    "Scout on incomplete information, sign clients, take your cut.",
};

// Both faces are self-hosted through the `geist` package, so the interface has
// no runtime network dependency and never flashes a fallback. Sans carries the
// prose; mono carries every number the game asks you to compare.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
