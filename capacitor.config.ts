import { CapacitorConfig } from '@capacitor/cli';
import fs from 'fs';
import path from 'path';

let devConfig = {};
const localConfigPath = path.join(__dirname, 'capacitor.config.local.json');

if (fs.existsSync(localConfigPath)) {
  try {
    devConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
    console.log('✔ Cargando configuración local de desarrollo para Capacitor');
  } catch (e) {
    console.error('❌ Error leyendo capacitor.config.local.json', e);
  }
}

const config: CapacitorConfig = {
  appId: 'com.chrismusic.app',
  appName: 'ChrisMusic',
  webDir: 'out',
  overrideUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  server: {
    androidScheme: 'https',
    ...((devConfig as any).server || {})
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorUpdater: {
      autoUpdate: false
    }
  },
};

export default config;
