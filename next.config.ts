import type { NextConfig } from "next";

/** Chromium bin musi trafić do serverless bundle — bez tego PDF umów pada na Vercel. */
const chromiumTracingIncludes = ["./node_modules/@sparticuz/chromium/**"];

/** Fonty pdfmake dla PDF faktur (polskie znaki). */
const invoiceFontIncludes = ["./assets/fonts/**"];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@sparticuz/chromium",
    "puppeteer",
    "puppeteer-core",
    "@puppeteer/browsers",
    "proxy-agent",
    "socks-proxy-agent",
    "pdfmake",
  ],
  outputFileTracingIncludes: {
    "/api/enrollment/sign": chromiumTracingIncludes,
    "/api/cron/monthly-invoices": invoiceFontIncludes,
    "/api/admin/invoices/generate-monthly": invoiceFontIncludes,
    "/api/admin/invoices/generate-yearly": invoiceFontIncludes,
    "/api/admin/lesson-billing/[id]/invoice": invoiceFontIncludes,
    "/api/admin/lesson-billing/generate-invoices": invoiceFontIncludes,
    "/api/accountant/invoices/corrective": invoiceFontIncludes,
    "/api/accountant/invoices/held": invoiceFontIncludes,
  },
};

export default nextConfig;
