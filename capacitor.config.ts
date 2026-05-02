import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kentarosource.sanpo',
  appName: 'せかいさんぽ',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
