import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@aws-sdk/client-s3", "puppeteer"],
};

export default nextConfig;
