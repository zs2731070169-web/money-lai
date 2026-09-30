/** 所有应用自有、用户可见文案的单一来源。用户输入不经过此表。 */
export const BACK_PROMPTS = [
  '想说的是……',
  '今天最难受的是……',
  '其实一直没说的是……',
  '如果可以，我想……',
] as const;

export const COPY = {
  appName: '燃信',
  privacyTitle: '只留在这里',
  privacySummary: '写下的内容与手帐只保存在这台设备上。匿名计数只发送一次无内容的增量。',
  agree: '同意并进入',
  privacyPolicy: '隐私',
  mileage: '心里话里程',
  themes: '主题',
  themeSetSummary: '信封 · 信纸 · 背景',
  fontPackages: '字体',
  fontPackageSelectedSuffix: ' · 已选',
  achievements: '成就',
  journal: '手帐',
  clearJournal: '清空手帐',
  dispatchTitle: '这封信要寄出去吗？',
  dispatchLocalButton: '存入自己的手帐',
  dispatchSendButton: '寄出这封信',
  dispatchCancelButton: '取消',
  clearConfirm: '确认清空手帐？',
  cancel: '取消',
  confirm: '确认',
  back: '返回',
  backLabel: '‹ 返回',
  mileageCompleted: '本机收好的心里话',
  themeSelectedSuffix: ' · 已选',
  unavailable: '暂不可用',
  saveFailed: '记录未能保存',
  now: '此刻',
  statSuffix: '张信纸已被收好',
} as const;

export const FONT_PACKAGE_COPY = {
  'warm-handwriting': { name: '温柔手写风', description: '适合个人书信与情感向文字', preview: '愿今天的风把这一句话轻轻带走' },
  'classical-elegant': { name: '古典优雅风', description: '适合正式、叙事与慢节奏书信', preview: '愿岁月安静，字句自有回声' },
  'romantic-literary': { name: '浪漫文艺风', description: 'Cormorant Garamond 与霞鹜文楷中英文混排', preview: '在花影与纸边之间，留一句想念' },
} as const;

export const THEME_NAMES = {
  topic1: '铃兰',
} as const;

export const POSTCARD_NAMES = {
  'postcard-lily-paper': '铃兰信纸',
} as const;

export const ACHIEVEMENT_COPY = {
  'first-draw': { name: '第一封', description: '第一次从信封取出信纸' },
  'first-burn': { name: '第一次倾诉', description: '第一次确认收好心里的信' },
  'mileage-10': { name: '十张纸', description: '本机心里话里程达到十张' },
} as const;

export const FLOATING_COPY = [
  ...BACK_PROMPTS,
  COPY.unavailable,
  COPY.saveFailed,
  COPY.now,
  COPY.statSuffix,
] as const;

export function formatBurnCount(count: number): string {
  return `${count} ${COPY.statSuffix}`;
}