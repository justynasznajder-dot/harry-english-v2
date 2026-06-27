import { loadEnvFiles } from "./scripts/load-env";
import { defineConfig, env } from "prisma/config";

loadEnvFiles();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
