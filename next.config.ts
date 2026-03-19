import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  // Let's set these to false to avoid the loop in Dev
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com', // YouTube thumbnails
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
};

export default withPWA(nextConfig);
