/**
 * 确定性伪随机数生成器（mulberry32）：
 * 种子驱动、跨运行一致——BGM 计划与音频白噪共用的唯一实现。
 */
export function createSeededRandomNumberGenerator(seed: number): () => number {
  let randomState = seed >>> 0;
  return () => {
    randomState = (randomState + 0x6d2b79f5) >>> 0;
    let scrambled = randomState;
    scrambled = Math.imul(scrambled ^ (scrambled >>> 15), scrambled | 1);
    scrambled ^= scrambled + Math.imul(scrambled ^ (scrambled >>> 7), scrambled | 61);
    return ((scrambled ^ (scrambled >>> 14)) >>> 0) / 4294967296;
  };
}
