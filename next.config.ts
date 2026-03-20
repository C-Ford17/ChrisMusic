import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'yt3.ggpht.com', // YouTube avatars
        pathname: '/**',
      }
    ],
    unoptimized: true,
  },
  output: 'export',
  trailingSlash: true,
  // Disable PWA for Tauri builds to avoid 'length' of undefined errors during export
  allowedDevOrigins: ['192.168.1.195', 'localhost:3000'],
};

export default nextConfig;
