import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const nextConfig: NextConfig = {
  turbopack: {
    root
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb"
    }
  }
};

export default nextConfig;
