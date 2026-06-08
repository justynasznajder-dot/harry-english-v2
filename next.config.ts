import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@sparticuz/chromium",
    "puppeteer",
    "puppeteer-core",
  ],
};

export default nextConfig;
