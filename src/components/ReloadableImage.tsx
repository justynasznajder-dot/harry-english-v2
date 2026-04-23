"use client";

/**
 * 🔄 ReloadableImage
 * -----------------------------------------
 * Cel:
 *  - Podczas pracy nad projektem (DEV) pozwala podmieniać pliki PNG/SVG/JPG
 *    bez konieczności zmiany nazwy, czyszczenia cache ani Ctrl+F5.
 *  - W trybie developerskim zamiast <Image> używa <img> z query stringiem `?t=<timestamp>`
 *    co wymusza pobranie najnowszej wersji obrazka przy każdym odświeżeniu strony.
 *  - W produkcji komponent działa jak standardowy next/image — optymalizacje, lazyload, cache.
 *
 * Zachowanie:
 *  - DEV:   <img src="/logo.png?t=123456" />
 *  - PROD:  <Image src="/logo.png" />
 *
 * Dzięki temu:
 *  - możesz testować i podmieniać grafiki bez zmiany nazw plików,
 *  - użytkownicy końcowi nie widzą żadnych query stringów i mają w pełni poprawne cache.
 *
 * Jeśli kiedyś chcesz wyłączyć bustowanie dla konkretnej grafiki:
 *
 *    <ReloadableImage src="/img.png" devNoCache={false} />
 *
 * -----------------------------------------
 * Możliwe scenariusze użycia:
 *  ✓ projektowanie layoutu / częste zmiany logo/hero
 *  ✓ porównywanie wersji wizualnych bez restartu projektu
 *  ✗ Do produkcji nic nie zmieniasz — komponent sam wykrywa środowisko!
 *
 */

import Image, { ImageProps } from "next/image";
import { useEffect, useState } from "react";

type ReloadableImageProps = Omit<ImageProps, "src"> & {
  src: string;
  devNoCache?: boolean;
};

export default function ReloadableImage({
  src,
  devNoCache = true,
  ...rest
}: ReloadableImageProps) {
  const isDev = process.env.NODE_ENV === "development";

  // null = brak bustowania (pierwszy render = to samo co SSR)
  const [stamp, setStamp] = useState<number | null>(null);

  useEffect(() => {
    if (isDev && devNoCache) {
      setStamp(Date.now());
    }
  }, [isDev, devNoCache]);

  // --------- DEV MODE (po hydratacji) ----------
  if (isDev && devNoCache) {
    const { alt, className, style, width, height, fill } = rest as any;

    // dopóki stamp === null, używamy czystego src (SSR + pierwszy render klienta)
    const srcWithTs =
      stamp == null
        ? src
        : `${src}${src.includes("?") ? "&" : "?"}t=${stamp}`;

    // Jeśli używamy fill, musimy symulować zachowanie Next.js Image z fill
    if (fill) {
      return (
        <img
          src={srcWithTs}
          alt={alt}
          className={className}
          style={{
            position: "absolute",
            height: "100%",
            width: "100%",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            color: "transparent",
            ...style,
          }}
        />
      );
    }

    // Standardowy przypadek z width/height
    return (
      <img
        src={srcWithTs}
        alt={alt}
        width={width ?? 300}
        height={height ?? 300}
        className={className}
        style={{ objectFit: "contain", ...style }}
      />
    );
  }

  // --------- PROD MODE (normalny next/image) ----------
  return <Image src={src} {...rest} />;
}
