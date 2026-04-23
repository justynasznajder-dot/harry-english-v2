import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CookieBanner from "@/src/components/CookieBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harry English - angielski z pasją",
  description: "Szkoła języka angielskiego. Zajęcia dla przedszkolaków, uczniów i dorosłych. Małe grupy, doświadczeni lektorzy.",
  icons: {
    icon: "/icon.svg",
  },
  metadataBase: new URL("https://www.harry-english.pl"),
  openGraph: {
    title: "Harry English - angielski z pasją",
    description: "Szkoła języka angielskiego. Zajęcia dla przedszkolaków, uczniów i dorosłych. Małe grupy, doświadczeni lektorzy.",
    url: "https://www.harry-english.pl",
    siteName: "Harry English",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Harry English - angielski z pasją",
    description: "Szkoła języka angielskiego. Zajęcia dla przedszkolaków, uczniów i dorosłych. Małe grupy, doświadczeni lektorzy.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
