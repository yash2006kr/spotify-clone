import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

const envRoots = [process.cwd(), resolve(process.cwd(), "..")];

for (const envRoot of envRoots) {
  if (existsSync(resolve(envRoot, ".env.local"))) {
    loadEnvConfig(envRoot);
  }
}
