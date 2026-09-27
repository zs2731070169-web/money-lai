import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * import-audit 脚本自检（任务 1.3 验证入口）：
 * 违规夹具必须报错退出、干净夹具必须通过——保证审计脚本本身可信。
 */
function runImportAudit(targetDirectory: string): { exitCode: number; stdout: string } {
  try {
    const stdout = execFileSync('node', ['scripts/import-audit.mjs', targetDirectory], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout };
  } catch (commandError) {
    // 非零退出时 execFileSync 抛错：从错误对象取真实退出码与输出（消除恒真断言）
    const typedError = commandError as { status?: number; stdout?: string };
    return { exitCode: typedError.status ?? 1, stdout: String(typedError.stdout ?? '') };
  }
}

describe('内核平台依赖静态审计', () => {
  it('对故意违规样例报错退出（真实 exitCode = 1）', () => {
    const auditResult = runImportAudit('testfixtures/import-audit/violating');
    expect(auditResult.exitCode).toBe(1);
  });

  it('对干净样例通过', () => {
    const auditResult = runImportAudit('testfixtures/import-audit/clean');
    expect(auditResult.exitCode).toBe(0);
    expect(auditResult.stdout).toContain('审计通过');
  });

  it('真实内核目录（src/core）通过审计', () => {
    const auditResult = runImportAudit('src/core');
    expect(auditResult.exitCode).toBe(0);
  });
});
