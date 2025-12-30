import type { NextConfig } from "next";

import { resolve } from "path";
import fs from "fs";

// Load environment variables from the root directory
// We manually parse this because @next/env was failing to resolve the path correctly in this monorepo structure.
console.log("--- [CMS NextConfig] Loading Env ---");
const projectDir = process.cwd();
const envPath = resolve(projectDir, "../../.env");

console.log(`[CMS NextConfig] Attempting to load env from: ${envPath}`);

if (fs.existsSync(envPath)) {
  try {
    const envFile = fs.readFileSync(envPath, "utf8");
    envFile.split("\n").forEach((line) => {
      // Simple parsing: KEY=VAL
      // Ignores comments starting with #
      if (line.trim().startsWith("#")) return;

      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes

        // Only set if not already set (respect system envs)
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log("[CMS NextConfig] Successfully loaded root .env variables.");
    console.log("[CMS NextConfig] SUPABASE_URL present: ", !!process.env.SUPABASE_URL);
  } catch (error) {
    console.error("[CMS NextConfig] Failed to parse .env file:", error);
  }
} else {
  console.warn("[CMS NextConfig] Root .env file not found.");
}
console.log("--------------------------------");

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
