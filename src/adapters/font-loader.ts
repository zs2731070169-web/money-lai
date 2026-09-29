import { FONT_PACKAGES } from '../core/render/letter-font';

/**
 * 加载随包霞鹜文楷，并在游戏开放前让字体完成解码。
 * 字体加载失败时仍然启动离线主循环，但不请求任何运行时网络资源。
 */
export async function loadLetterHandwritingFont(): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;

  try {
    const assets = new Map(FONT_PACKAGES.flatMap((fontPackage) => fontPackage.assets.map((asset) => [asset.family, asset])));
    await Promise.all([...assets.values()].map(async (asset) => {
      const fontUrl = new URL(`../../assets/fonts/${asset.fileName}`, import.meta.url).href;
      const face = new FontFace(asset.family, `url("${fontUrl}") format("${asset.format}")`, {
        style: 'normal', weight: asset.weight ?? '400', stretch: 'normal', display: 'block',
      });
      await face.load();
      document.fonts.add(face);
      await document.fonts.load(`400 18px "${asset.family}"`, '愿今天的风把这一句话轻轻带走');
    }));
    return true;
  } catch {
    return false;
  }
}
