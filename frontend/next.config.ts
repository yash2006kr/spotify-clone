import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
loadEnvConfig(root);

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    root
  }
};

export default nextConfig;
