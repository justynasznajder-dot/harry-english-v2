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
  description: "Kursy języka angielskiego. Zajęcia dla przedszkolaków, uczniów i dorosłych. Małe grupy, doświadczeni lektorzy.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  metadataBase: new URL("https://www.harry-english.pl"),
  openGraph: {
    title: "Harry English - angielski z pasją",
    description: "Kursy języka angielskiego. Zajęcia dla przedszkolaków, uczniów i dorosłych. Małe grupy, doświadczeni lektorzy.",
    url: "https://www.harry-english.pl",
    siteName: "Harry English",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Harry English - angielski z pasją",
    description: "Kursy języka angielskiego. Zajęcia dla przedszkolaków, uczniów i dorosłych. Małe grupy, doświadczeni lektorzy.",
    images: ["/images/logo_link.png"],
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
