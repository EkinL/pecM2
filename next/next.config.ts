import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.modules = [
      path.join(__dirname, 'node_modules'),
      ...(config.resolve.modules ?? []),
    ];
    return config;
  },
};

export default nextConfig;
