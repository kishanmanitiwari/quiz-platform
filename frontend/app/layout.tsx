import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ISKCON Live Quiz",
  description: "Live room-based quiz platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
