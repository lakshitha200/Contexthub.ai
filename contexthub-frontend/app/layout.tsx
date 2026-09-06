import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "ContextHub · AI Knowledge Workspace (Beta)",
    template: "%s · ContextHub",
  },
  description:
    "Upload your team's documents and ask anything. ContextHub retrieves the exact passages and answers with citations. Currently in public beta.",
  applicationName: "ContextHub",
  keywords: ["AI knowledge base", "document search", "RAG", "cited answers", "team workspace"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Next 16 stopped overriding a global `scroll-behavior: smooth` during
      // route changes, which made every navigation smooth-scroll to the top.
      // This attribute opts back into the old override: instant on navigation,
      // smooth for in-page anchors like the marketing nav.
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        {/* Companion to the `scripting: none` rule in globals.css. Framer
            Motion server-renders its initial variant, so without JavaScript
            every revealed section would sit at opacity 0 and the page would
            look empty. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
