/** 构造最小 16bit PCM 单声道 WAV 字节，供抽出素材的解码与播放测试使用。 */
export function createWavSampleBytes(durationSeconds: number, sampleRate = 44100, amplitude = 0.5): ArrayBuffer {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataLength = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, dataLength, true);
  for (let index = 0; index < sampleCount; index += 1) {
    // 前 50ms 一个 440Hz 短音、其后静默，便于断言“有可听开头且不循环”
    const seconds = index / sampleRate;
    const sample = seconds < 0.05 ? Math.sin(2 * Math.PI * 440 * seconds) * amplitude : 0;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return buffer;
}
