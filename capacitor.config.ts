import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chrismusic.app',
  appName: 'ChrisMusic',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  }
};

export default config;
