import { expect, test } from '@playwright/test';
import { importText } from './helpers';

test('body read failure has a persistent error and a working retry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '导入 TXT 书籍' })).toBeEnabled();
  await importText(page, '读取重试.txt', '保留这份故事。');
  await page.getByRole('button', { name: '返回书架' }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    (window as unknown as { restoreReads: () => void }).restoreReads = () => { IDBObjectStore.prototype.getAll = original; };
    IDBObjectStore.prototype.getAll = function(...args) { if (this.name === 'blocks') throw new DOMException('Failed', 'UnknownError'); return original.apply(this, args); };
  });
  await page.getByRole('button', { name: '阅读 读取重试', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('正文读取失败');
  await expect(page.getByRole('button', { name: '重试读取' })).toBeVisible();
  // Restore the fault only when the retry is pressed, so a viewport-triggered
  // automatic read cannot remove the button before this user action.
  await page.getByRole('button', { name: '重试读取' }).evaluate(button => {
    button.addEventListener('pointerdown', () => (window as unknown as { restoreReads: () => void }).restoreReads(), { once: true });
  });
  await page.getByRole('button', { name: '重试读取' }).click();
  await expect(page.locator('[data-text-start]')).toContainText('保留这份故事。');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('database open failure explains local storage and retries without reloading', async ({ page }) => {
  await page.addInitScript(() => {
    const original = indexedDB.open.bind(indexedDB);
    (window as unknown as { restoreOpen: () => void }).restoreOpen = () => { indexedDB.open = original; };
    indexedDB.open = () => { throw new DOMException('Denied', 'SecurityError'); };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('无法打开本地书架');
  await page.evaluate(() => (window as unknown as { restoreOpen: () => void }).restoreOpen());
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('这里，等着你的第一本书')).toBeVisible();
  await importText(page, '恢复.txt', '本地保存已恢复。');
});
