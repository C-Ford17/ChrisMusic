import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chrismusic.app',
  appName: 'ChrisMusic',
  webDir: 'out',
  overrideUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  server: {
    androidScheme: 'https'
  }
};

export default config;
