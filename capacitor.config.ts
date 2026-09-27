import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hariku.moneylai',
  appName: 'money来',
  webDir: 'dist',
  ios: {
    // 游戏为全屏画布：关闭 WebView 滚动与橡皮筋（设计 D9）
    scrollEnabled: false,
  },
};

export default config;
