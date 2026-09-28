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
  privacyPolicy: '隐私政策',
  localOnly: '这些东西只在这台设备上。',
  medicalDisclaimer: '本产品不提供医疗服务',
  youthLine: '12355',
  mileage: '明信片里程',
  gallery: '明信片图鉴',
  appearances: '信封与纸纹',
  achievements: '成就',
  journal: '手帐',
  exportLongImage: '导出长图',
  clearJournal: '烧掉整本手帐',
  clearConfirm: '确认清空手帐与已收集图案？',
  cancel: '取消',
  confirm: '确认',
  about: '关于（署名）',
  aboutSignature: 'hariku · 燃信',
  back: '返回',
  backLabel: '‹ 返回',
  envelopeMaterials: '信封材质',
  postcardTextures: '明信片纸纹',
  mileageCompleted: '本机完成的明信片',
  appearanceActiveSuffix: ' · 已启用',
  appearanceAvailableSuffix: '张可用',
  exportFilePrefix: '燃信手帐',
  unavailable: '暂不可用',
  saveFailed: '记录未能保存',
  exportFailed: '长图未能导出',
  now: '此刻',
  statSuffix: '张明信片已被燃烧',
} as const;

export const APPEARANCE_NAMES = {
  'envelope-kraft': '原色棉纸',
  'envelope-rose': '旧玫瑰',
  'envelope-moss': '苔灰',
  'envelope-night': '暮蓝',
  'paper-plain': '素纸',
  'paper-fiber': '细纤',
  'paper-sand': '暖砂',
  'paper-mist': '雾白',
} as const;

export const ACHIEVEMENT_COPY = {
  'first-draw': { name: '第一封', description: '第一次从信封取出明信片' },
  'first-burn': { name: '一点火光', description: '完成第一张明信片' },
  'first-blank': { name: '留白', description: '完成一张空白明信片' },
  'patterns-6': { name: '六幅小景', description: '收集六种明信片图案' },
  'mileage-10': { name: '十张纸', description: '本机明信片里程达到十张' },
  'all-patterns': { name: '一册纸景', description: '收集全部明信片图案' },
} as const;

export const FLOATING_COPY = [
  ...BACK_PROMPTS,
  COPY.unavailable,
  COPY.saveFailed,
  COPY.exportFailed,
  COPY.now,
  COPY.statSuffix,
] as const;

export function formatBurnCount(count: number): string {
  return `${count} ${COPY.statSuffix}`;
}

export function formatAppearanceName(name: string, active: boolean): string {
  return active ? `${name}${COPY.appearanceActiveSuffix}` : name;
}

export function formatAppearanceUnlockMileage(mileage: number): string {
  return `${mileage} ${COPY.appearanceAvailableSuffix}`;
}
