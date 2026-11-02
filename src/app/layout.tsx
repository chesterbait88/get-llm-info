import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Hardware Matcher",
  description: "Which open models can my machine run, and how fast will they write?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
