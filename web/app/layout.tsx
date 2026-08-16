import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Toaster } from "@/components/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Agent",
  description:
    "Scout on incomplete information, sign clients, take your cut.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
