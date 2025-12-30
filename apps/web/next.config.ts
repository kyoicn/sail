import type { NextConfig } from "next";
import { resolve } from "path";
import { loadEnvConfig } from "@next/env";

// Load environment variables from the root directory
const projectDir = process.cwd();
const rootDir = resolve(projectDir, "../../");
loadEnvConfig(rootDir);

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
