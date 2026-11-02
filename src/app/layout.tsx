import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Hardware Matcher",
  description: "Which open models can my machine run, and how fast will they write?",
};

// Apply a saved theme choice before first paint so there is no flash of the wrong theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
