import type { NextConfig } from "next";
import { loadEnvConfig } from '@next/env';
import path from 'path';

// Load env vars from the monorepo root (../../)
const projectDir = process.cwd();
loadEnvConfig(path.join(projectDir, '../../'));

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
