import { expect, test } from '@playwright/test';
import iconv from 'iconv-lite';
import { currentOffset, dbSnapshot, stableOffset } from '../e2e/helpers';
import { writeFile } from 'node:fs/promises';

for (const sizeMiB of [1, 10, 50]) for (const encoding of ['utf-8', 'gbk']) {
  test(`${sizeMiB} MiB ${encoding} import, open and scroll`, async ({ page, browser }, testInfo) => {
    const line = '山川与故事。风吹过窗前，书页轻轻翻动。读书的人走在长路上，看见远方的山与星。\n\n';
    const lineBytes = iconv.encode(line, encoding).byteLength;
    const buffer = iconv.encode(line.repeat(Math.ceil(sizeMiB * 1024 * 1024 / lineBytes)), encoding);
    await page.goto('/');
    const session = await page.context().newCDPSession(page);
    await session.send('Performance.enable');
    const samplePath = testInfo.outputPath('压力样本.txt');
    await writeFile(samplePath, buffer);
    const start = performance.now();
    await page.getByTestId('file-input').setInputFiles(samplePath);
    await expect(page.getByRole('button', { name: '导入并阅读' })).toBeEnabled();
    const decodeMs = performance.now() - start;
    const saveStart = performance.now();
    await page.getByRole('button', { name: '导入并阅读' }).click();
    await expect(page.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
    const saveAndOpenMs = performance.now() - saveStart;
    await page.getByRole('button', { name: '返回书架' }).click();
    const openStart = performance.now();
    await page.getByRole('button', { name: '阅读 压力样本', exact: true }).click();
    await expect(page.getByTestId('reader-viewport')).toHaveAttribute('aria-busy', 'false');
    const openMs = performance.now() - openStart;
    const viewport = page.getByTestId('reader-viewport');
    await viewport.evaluate(el => { el.scrollTop = el.scrollHeight * 0.7; });
    await expect.poll(() => currentOffset(page)).toBeGreaterThan(10000);
    const before = await stableOffset(page);
    await page.getByRole('button', { name: '阅读设置' }).click();
    await page.getByLabel('字号', { exact: false }).fill('26');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(viewport).toHaveAttribute('aria-busy', 'false');
    const after = await currentOffset(page);
    expect(Math.abs(after - before)).toBeLessThan(100);
    const domBlocks = await page.locator('.text-block').count();
    expect(domBlocks).toBeLessThan(20);
    const metrics = await session.send('Performance.getMetrics');
    const snapshot = await dbSnapshot(page);
    const result = { browser: browser.version(), platform: process.platform, sampleMiB: sizeMiB, encoding, actualBytes: buffer.byteLength, decodeMs: Math.round(decodeMs), saveAndOpenMs: Math.round(saveAndOpenMs), openMs: Math.round(openMs), domBlocks, storedBlocks: snapshot.blockCount, jsHeapMiB: Math.round((metrics.metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1024 / 1024) };
    console.log(JSON.stringify(result));
    await testInfo.attach('performance.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    if (sizeMiB === 10) expect(openMs).toBeLessThan(2000);
  });
}
