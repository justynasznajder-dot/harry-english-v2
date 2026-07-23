import type { NextConfig } from "next";

/** Chromium bin musi trafić do serverless bundle — bez tego PDF pada na Vercel. */
const chromiumTracingIncludes = ["./node_modules/@sparticuz/chromium/**"];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@sparticuz/chromium",
    "puppeteer",
    "puppeteer-core",
  ],
  outputFileTracingIncludes: {
    "/api/enrollment/sign": chromiumTracingIncludes,
    "/api/cron/monthly-invoices": chromiumTracingIncludes,
    "/api/admin/invoices/generate-monthly": chromiumTracingIncludes,
    "/api/admin/lesson-billing/[id]/invoice": chromiumTracingIncludes,
    "/api/accountant/invoices/corrective": chromiumTracingIncludes,
  },
};

export default nextConfig;
