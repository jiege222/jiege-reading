import { expect, type Page } from '@playwright/test';
import iconv from 'iconv-lite';

export const novel = Array.from({ length: 5000 }, (_, i) => `第${i.toString().padStart(5, '0')}段：风穿过窗前的树，书页轻轻翻动。我们走在长长的路上，看见远方的山和夜空的星。😀\n\n`).join('');

export async function importText(page: Page, name: string, text: string, encoding = 'utf-8') {
  await page.getByTestId('file-input').setInputFiles({ name, mimeType: 'text/plain', buffer: iconv.encode(text, encoding) });
  await expect(page.getByRole('button', { name: '导入并阅读' })).toBeEnabled();
  await page.getByRole('button', { name: '导入并阅读' }).click();
  await expect(page.getByTestId('reader-viewport')).toBeVisible();
  await expect(page.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-text-start]').first()).toBeVisible();
}

export async function dbSnapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('jiege-reading', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['books', 'progress', 'blocks', 'settings']);
    const request = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const [books, progress, blockCount, settings] = await Promise.all([
      request(tx.objectStore('books').getAll()), request(tx.objectStore('progress').getAll()),
      request(tx.objectStore('blocks').count()), request(tx.objectStore('settings').get('reading')),
    ]);
    db.close();
    return { books, progress, blockCount, settings };
  });
}

export async function currentOffset(page: Page) {
  return page.getByTestId('reader-viewport').evaluate(async viewport => {
    const sourceUrl = '/src/reader/anchor.ts';
    const { visibleAnchor } = await import(sourceUrl);
    return visibleAnchor(viewport as HTMLElement) ?? 0;
  });
}

export async function scrollTo(page: Page, pixels: number) {
  await page.getByTestId('reader-viewport').evaluate((el, y) => { el.scrollTop = y; }, pixels);
  await expect.poll(() => currentOffset(page)).toBeGreaterThan(0);
  // Let dynamic measurements and the throttled progress snapshot settle.
  await expect.poll(async () => (await dbSnapshot(page)).progress[0]?.textOffset ?? 0).toBeGreaterThan(0);
  await stableOffset(page);
}

export async function stableOffset(page: Page) {
  let previous = -1;
  let stable = 0;
  await expect.poll(async () => {
    const offset = await currentOffset(page);
    stable = offset === previous ? stable + 1 : 0;
    previous = offset;
    return stable;
  }, { intervals: [100, 100, 100] }).toBeGreaterThanOrEqual(3);
  return previous;
}

export async function anchorLayout(page: Page, wanted: number) {
  return page.getByTestId('reader-viewport').evaluate(async (el, offset) => {
    const source = '/src/reader/anchor.ts'; const { characterRect, offsetAtTop, visibleAnchor } = await import(source);
    const top = el.getBoundingClientRect().top;
    return { wanted: offset, actual: visibleAnchor(el), physical: el.scrollTop, logical: el.dataset.logicalOffset, top, blocks: Array.from(el.querySelectorAll<HTMLElement>('[data-text-start]')).map(b => {
      const start = Number(b.dataset.textStart); const rect = b.getBoundingClientRect();
      return { start, length: b.textContent?.length, top: rect.top - top, bottom: rect.bottom - top, atTop: start + offsetAtTop(b, top + 8), wantedY: offset >= start && offset < start + (b.textContent?.length ?? 0) ? characterRect(b, offset - start)?.top! - top : null };
    }) };
  }, wanted);
}
