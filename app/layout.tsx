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
    icon: [{ url: "/images/logo_link.png", type: "image/png", sizes: "1200x1200" }],
    apple: [{ url: "/images/logo_link.png", type: "image/png", sizes: "1200x1200" }],
  },
  metadataBase: new URL("https://www.harry-english.pl"),
  openGraph: {
    title: "Harry English - angielski z pasją",
    description: "Szkoła języka angielskiego. Zajęcia dla przedszkolaków, uczniów i dorosłych. Małe grupy, doświadczeni lektorzy.",
    url: "https://www.harry-english.pl",
    siteName: "Harry English",
    type: "website",
    images: [
      {
        url: "/images/logo_link.png",
        width: 1200,
        height: 1200,
        alt: "Harry English",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Harry English - angielski z pasją",
    description: "Szkoła języka angielskiego. Zajęcia dla przedszkolaków, uczniów i dorosłych. Małe grupy, doświadczeni lektorzy.",
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
