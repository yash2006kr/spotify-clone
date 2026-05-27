import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    root
  }
};

export default nextConfig;
