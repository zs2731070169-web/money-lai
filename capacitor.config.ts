import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hariku.letterburning',
  appName: '燃信',
  webDir: 'dist',
  ios: {
    // 全屏纸面画布：关闭 WebView 滚动与橡皮筋。
    scrollEnabled: false,
  },
};

export default config;
