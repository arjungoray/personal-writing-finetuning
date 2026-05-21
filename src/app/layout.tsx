import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Lab",
  description: "Local writing style fine-tuning workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
