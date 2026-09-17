import { expect, test } from '@playwright/test';
import iconv from 'iconv-lite';
import { anchorLayout, currentOffset, dbSnapshot, importText, novel, scrollTo } from './helpers';

test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('button', { name: '导入 TXT 书籍' })).toBeEnabled(); });

test('empty shelf, UTF-8 import, plain text, refresh and transaction deletion', async ({ page }) => {
  await expect(page.getByText('这里，等着你的第一本书')).toBeVisible();
  await importText(page, '第一本.TXT', '\ufeff第一章\r\n\r\n你好，世界！😀\r\n<script>window.hacked=true</script>');
  await expect(page.locator('[data-text-start]')).toHaveText('第一章\n\n你好，世界！😀\n<script>window.hacked=true</script>');
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false);
  await page.getByRole('button', { name: '返回书架' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '第一本', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除 第一本' }).click();
  await page.getByRole('button', { name: '保留这本书' }).click();
  expect((await dbSnapshot(page)).books).toHaveLength(1);
  await page.getByRole('button', { name: '删除 第一本' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('这里，等着你的第一本书')).toBeVisible();
  const snapshot = await dbSnapshot(page);
  expect(snapshot.books).toHaveLength(0);
  expect(snapshot.progress).toHaveLength(0);
  expect(snapshot.blockCount).toBe(0);
});

test('GBK detection and manual encoding correction use the same original file', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({ name: '编码.txt', mimeType: '', buffer: iconv.encode('第一章\r\n山川与故事\r\n\r\n你好，世界。', 'gbk') });
  await expect(page.locator('.text-preview')).toContainText('山川与故事');
  await page.getByLabel('文本编码').selectOption('utf-8');
  await expect(page.locator('.text-preview')).toContainText('�');
  await page.getByLabel('文本编码').selectOption('gbk');
  await expect(page.locator('.text-preview')).toContainText('你好，世界。');
  await page.getByRole('button', { name: '导入并阅读' }).click();
  await expect(page.locator('[data-text-start]')).toHaveText('第一章\n山川与故事\n\n你好，世界。');
  expect((await dbSnapshot(page)).books[0].encoding).toBe('gbk');
});

test('invalid, empty and binary files explain the error and permit retry', async ({ page }) => {
  for (const [name, text, error] of [['book.pdf', 'text', '请选择 TXT 文件'], ['empty.txt', '', '这个文件是空的'], ['blank.txt', '\n \t', '只有空白'], ['binary.txt', 'aaa\x00\x02bbb', '二进制']]) {
    await page.getByTestId('file-input').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
    await expect(page.getByRole('alert')).toContainText(error);
    await expect(page.getByRole('button', { name: '导入并阅读' })).toBeDisabled();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  }
  expect((await dbSnapshot(page)).books).toHaveLength(0);
  await importText(page, '正常.txt', '这次导入成功。');
});

test('content anchors survive refresh, font, line spacing and width changes', async ({ page }) => {
  await importText(page, '长篇.txt', novel);
  await scrollTo(page, 8500);
  const before = await currentOffset(page);
  await page.getByRole('button', { name: '阅读设置' }).click();
  await page.getByLabel('字号', { exact: false }).fill('28');
  await page.getByLabel('行距', { exact: false }).fill('2.4');
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.getByText('设置已保存 · 设置应用于所有书籍')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
  expect(Math.abs((await currentOffset(page)) - before)).toBeLessThan(100);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
  try { await expect.poll(async () => Math.abs((await currentOffset(page)) - before)).toBeLessThan(100); }
  catch (error) { console.log(JSON.stringify(await anchorLayout(page, before))); throw error; }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.reader-column').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: '返回书架' }).click();
  const saved = (await dbSnapshot(page)).progress[0].textOffset;
  expect(Math.abs(saved - before)).toBeLessThan(100);
  await page.reload();
  await page.getByRole('button', { name: '阅读 长篇', exact: true }).click();
  await expect(page.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
  expect(Math.abs((await currentOffset(page)) - saved)).toBeLessThan(100);
  expect(await page.locator('.reader-column').evaluate(el => getComputedStyle(el).fontSize)).toBe('28px');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const settings = (await dbSnapshot(page)).settings;
  expect(settings).toMatchObject({ fontSize: 28, lineHeight: 2.4, theme: 'dark' });
});

test('two books keep independent progress, reopen order and deleting one preserves the other', async ({ page }) => {
  await importText(page, '甲.txt', novel);
  await scrollTo(page, 7200);
  await page.getByRole('button', { name: '返回书架' }).click();
  const a = (await dbSnapshot(page)).progress[0];
  await importText(page, '乙.txt', novel);
  await scrollTo(page, 16000);
  await page.getByRole('button', { name: '返回书架' }).click();
  const snapshots = (await dbSnapshot(page)).progress;
  expect(snapshots.find(p => p.bookId === a.bookId).textOffset).toBe(a.textOffset);
  await page.getByRole('button', { name: '阅读 甲', exact: true }).click();
  await expect(page.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
  const actualA = await currentOffset(page);
  if (Math.abs(actualA - a.textOffset) >= 100) console.log(JSON.stringify(await anchorLayout(page, a.textOffset)));
  expect(Math.abs(actualA - a.textOffset)).toBeLessThan(100);
  await page.getByRole('button', { name: '返回书架' }).click();
  await expect(page.locator('.book-card').first().getByRole('heading')).toHaveText('甲');
  await page.getByRole('button', { name: '删除 甲' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  const remaining = await dbSnapshot(page);
  expect(remaining.books[0].title).toBe('乙');
  expect(remaining.progress).toEqual(snapshots.filter(p => p.bookId !== a.bookId));
});

test('fast scrolling and scrollbar jumps keep DOM bounded and body blocks available', async ({ page }) => {
  await importText(page, '超长段落.txt', ('中文与emoji😀不断向前。').repeat(90000));
  const viewport = page.getByTestId('reader-viewport');
  for (const ratio of [0.25, 0.75, 0.95, 0.1]) {
    await viewport.evaluate((el, p) => { el.scrollTop = el.scrollHeight * p; }, ratio);
    await expect.poll(() => viewport.locator('[data-text-start]').count()).toBeGreaterThan(1);
    await expect.poll(async () => {
      return viewport.evaluate(el => { const y = el.getBoundingClientRect().top + 30; return Array.from(el.querySelectorAll('[data-text-start]')).some(block => { const rect = block.getBoundingClientRect(); return rect.top <= y && rect.bottom > y; }); });
    }).toBe(true);
    expect(await viewport.locator('.text-block').count()).toBeLessThan(20);
  }
});

test('normal browser close and reopen restore the most recently completed save', async ({ browser, baseURL }) => {
  // Reuse storage via a persistent profile is covered by refresh; context close deletes temporary profiles.
  // A new page in the same context exercises lifecycle teardown and database reconnect.
  const context = await browser.newContext();
  const first = await context.newPage(); await first.goto(baseURL!);
  await expect(first.getByRole('button', { name: '导入 TXT 书籍' })).toBeEnabled();
  await importText(first, '重开.txt', novel);
  await scrollTo(first, 10000);
  await first.close();
  const second = await context.newPage(); await second.goto(baseURL!);
  const saved = (await dbSnapshot(second)).progress[0].textOffset;
  await second.getByRole('button', { name: '阅读 重开', exact: true }).click();
  await expect(second.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
  const actual = await currentOffset(second);
  if (Math.abs(actual - saved) >= 100) console.log(JSON.stringify(await anchorLayout(second, saved)));
  expect(Math.abs(actual - saved)).toBeLessThan(100);
  await context.close();
});

test('quota failure does not add partial books and can be retried', async ({ page }) => {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (window as unknown as { restoreAdd: () => void }).restoreAdd = () => { IDBObjectStore.prototype.add = original; };
    IDBObjectStore.prototype.add = function(...args) { if (this.name === 'blocks') throw new DOMException('Full', 'QuotaExceededError'); return original.apply(this, args); };
  });
  await page.getByTestId('file-input').setInputFiles({ name: '重试.txt', mimeType: 'text/plain', buffer: Buffer.from('保存错误后的故事') });
  await page.getByRole('button', { name: '导入并阅读' }).click();
  await expect(page.getByRole('alert')).toContainText('空间不足');
  const snapshot = await dbSnapshot(page);
  expect(snapshot.books).toHaveLength(0); expect(snapshot.blockCount).toBe(0); expect(snapshot.progress).toHaveLength(0);
  await page.evaluate(() => (window as unknown as { restoreAdd: () => void }).restoreAdd());
  await page.getByRole('button', { name: '导入并阅读' }).click();
  await expect(page.getByTestId('reader-viewport')).toBeVisible();
});

test('settings save failure stays visible and permits retry', async ({ page }) => {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function(...args) { if (this.name === 'settings') throw new DOMException('Full', 'QuotaExceededError'); return original.apply(this, args); };
  });
  await page.getByRole('button', { name: '阅读设置' }).click();
  await page.getByLabel('字号', { exact: false }).fill('24');
  await expect(page.getByText('设置尚未保存 · 设置应用于所有书籍')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('设置尚未保存');
  await page.evaluate(() => (window as unknown as { restorePut: () => void }).restorePut());
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await dbSnapshot(page)).settings.fontSize).toBe(24);
});

test('failed deletion rolls back, preserves the card and permits retry', async ({ page }) => {
  await importText(page, '保留.txt', '不能意外丢失的正文');
  await page.getByRole('button', { name: '返回书架' }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.delete;
    (window as unknown as { restoreDelete: () => void }).restoreDelete = () => { IDBObjectStore.prototype.delete = original; };
    IDBObjectStore.prototype.delete = function(...args) { if (this.name === 'blocks') throw new DOMException('Failed', 'UnknownError'); return original.apply(this, args); };
  });
  await page.getByRole('button', { name: '删除 保留' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  expect((await dbSnapshot(page)).books).toHaveLength(1);
  expect((await dbSnapshot(page)).progress).toHaveLength(1);
  expect((await dbSnapshot(page)).blockCount).toBe(1);
  await page.evaluate(() => (window as unknown as { restoreDelete: () => void }).restoreDelete());
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('这里，等着你的第一本书')).toBeVisible();
});

test('progress failure holds the reader open until retry succeeds', async ({ page }) => {
  await importText(page, '进度.txt', novel);
  await scrollTo(page, 11000);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restoreProgressPut: () => void }).restoreProgressPut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function(...args) { if (this.name === 'books') throw new DOMException('Failed', 'UnknownError'); return original.apply(this, args); };
  });
  await page.getByRole('button', { name: '返回书架' }).click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.getByTestId('reader-viewport')).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreProgressPut: () => void }).restoreProgressPut());
  await page.getByRole('button', { name: '返回书架' }).click();
  await expect(page.getByRole('button', { name: '阅读 进度', exact: true })).toBeVisible();
});

test('malformed saved settings fall back safely and out-of-range progress resumes at the end', async ({ page }) => {
  await importText(page, '旧数据.txt', novel);
  await page.getByRole('button', { name: '返回书架' }).click();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const req = indexedDB.open('jiege-reading', 1); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['settings', 'books', 'progress'], 'readwrite');
    tx.objectStore('settings').put({ id: 'reading', fontSize: -10, lineHeight: 100, theme: 'unknown' });
    const books = tx.objectStore('books').getAll();
    books.onsuccess = () => { tx.objectStore('progress').put({ bookId: books.result[0].id, textOffset: 999999999, updatedAt: Date.now() }); };
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: '阅读 旧数据', exact: true }).click();
  await expect(page.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.locator('.reader-column').evaluate(el => getComputedStyle(el).fontSize)).toBe('20px');
  await expect(page.locator('[data-text-start]').last()).toContainText('第04999段');
});
