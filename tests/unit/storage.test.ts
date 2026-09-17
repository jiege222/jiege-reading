import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { closeDB, createProgressWriter, DB_NAME, deleteBook, getDB, importBook, listBooks, loadSettings, readBlocks, readProgress, saveProgress, saveSettings } from '../../src/storage/db';
import { parseBytes } from '../../src/import/decode';
import { DEFAULT_SETTINGS, validSettings } from '../../src/storage/settings';
import { storageError } from '../../src/storage/errors';

const parsed = () => parseBytes(new TextEncoder().encode('正文😀\n\n第二段\n'.repeat(1000)).buffer);
beforeEach(async () => { await closeDB(); await deleteDB(DB_NAME); });
afterEach(async () => { vi.restoreAllMocks(); await closeDB(); });

describe('real transaction semantics with fake-indexeddb', () => {
  it('imports all blocks atomically and reads only requested ranges', async () => {
    const source = parsed();
    const book = await importBook('小说', 30000, source);
    expect(await listBooks()).toHaveLength(1);
    expect(await readBlocks(book.id, 1, 2)).toHaveLength(2);
    expect((await readBlocks(book.id, 0, book.blockCount)).map(block => block.text).join('')).toBe(source.blocks.map(block => block.text).join(''));
    expect(await readProgress(book.id)).toMatchObject({ textOffset: 0 });
  });
  it('rolls back an interrupted import, leaving no partial book or blocks', async () => {
    const source = parsed();
    source.blocks.push({ ...source.blocks[0] });
    await expect(importBook('故障', 1000, source)).rejects.toMatchObject({ name: 'ConstraintError' });
    const db = await getDB();
    expect(await db.count('books')).toBe(0);
    expect(await db.count('blocks')).toBe(0);
    expect(await db.count('progress')).toBe(0);
  });
  it('handles a synchronous quota failure and rolls back pending writes', async () => {
    const original = IDBObjectStore.prototype.add;
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(this: IDBObjectStore, ...args) {
      if (++calls === 3) throw new DOMException('Full', 'QuotaExceededError');
      return original.apply(this, args);
    });
    await expect(importBook('满了', 1000, parsed())).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await listBooks()).toHaveLength(0);
    expect(await (await getDB()).count('blocks')).toBe(0);
  });
  it('keeps per-book progress independent and deletes all related data', async () => {
    const a = await importBook('甲', 100, parsed());
    const b = await importBook('乙', 100, parsed());
    await saveProgress(a.id, 5678);
    await saveProgress(b.id, 2222);
    expect((await readProgress(a.id))?.textOffset).toBe(5678);
    expect((await readProgress(b.id))?.textOffset).toBe(2222);
    await deleteBook(a.id);
    expect((await listBooks()).map(book => book.id)).toEqual([b.id]);
    expect(await readProgress(a.id)).toBeUndefined();
    expect(await readBlocks(a.id, 0, 100)).toHaveLength(0);
    expect((await readProgress(b.id))?.textOffset).toBe(2222);
    await saveProgress(a.id, 20);
    expect(await readProgress(a.id)).toBeUndefined();
  });
  it('sorts books by last read and safely clamps stale offsets', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const a = await importBook('甲', 100, parsed());
    vi.mocked(Date.now).mockReturnValue(2000);
    const b = await importBook('乙', 100, parsed());
    vi.mocked(Date.now).mockReturnValue(3000);
    await saveProgress(a.id, 99999999);
    expect((await listBooks()).map(book => book.id)).toEqual([a.id, b.id]);
    expect((await readProgress(a.id))?.textOffset).toBe(a.textLength - 1);
  });
  it('saves settings and restores defaults for malformed old data', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    await saveSettings({ id: 'reading', fontSize: 26, lineHeight: 2.2, theme: 'dark' });
    expect(await loadSettings()).toMatchObject({ fontSize: 26, theme: 'dark' });
    expect(validSettings({ fontSize: NaN, lineHeight: 90, theme: 'unknown' })).toEqual(DEFAULT_SETTINGS);
    expect(validSettings({ fontSize: 4, lineHeight: '2' })).toEqual(DEFAULT_SETTINGS);
    expect(validSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('rolls back deletes even when failure occurs after metadata removal', async () => {
    const book = await importBook('保留', 100, parsed());
    const original = IDBObjectStore.prototype.delete;
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function(this: IDBObjectStore, ...args) {
      if (this.name === 'blocks') throw new DOMException('Failed', 'UnknownError');
      return original.apply(this, args);
    });
    await expect(deleteBook(book.id)).rejects.toMatchObject({ name: 'UnknownError' });
    expect(await listBooks()).toHaveLength(1);
    expect(await readProgress(book.id)).toBeDefined();
    expect(await readBlocks(book.id, 0, 100)).toHaveLength(book.blockCount);
  });
  it('rolls back progress if updating recent-reading metadata fails', async () => {
    const book = await importBook('进度', 100, parsed());
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args) {
      if (this.name === 'books') throw new DOMException('Failed', 'UnknownError');
      return original.apply(this, args);
    });
    await expect(saveProgress(book.id, 3000)).rejects.toMatchObject({ name: 'UnknownError' });
    expect((await readProgress(book.id))?.textOffset).toBe(0);
  });
});

describe('progress write ordering', () => {
  it('serializes writes and coalesces snapshots queued during a write', async () => {
    let release!: () => void;
    const calls: number[] = [];
    const writer = createProgressWriter(async offset => {
      calls.push(offset);
      if (offset === 1) await new Promise<void>(resolve => { release = resolve; });
    });
    const first = writer.save(1);
    writer.save(2);
    writer.save(3);
    expect(calls).toEqual([1]);
    release(); await first; await writer.flush();
    expect(calls).toEqual([1, 3]);
  });
  it('retains the latest failed snapshot for explicit retry', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue(undefined);
    const writer = createProgressWriter(write);
    await expect(writer.save(40)).rejects.toThrow('fail');
    await writer.flush();
    expect(write.mock.calls.map(args => args[0])).toEqual([40, 40]);
  });
});

it('maps quota, version, and generic errors to useful messages', () => {
  expect(storageError(new DOMException('', 'QuotaExceededError'))).toContain('空间不足');
  expect(storageError(new DOMException('', 'VersionError'))).toContain('版本');
  expect(storageError(new Error('private'))).toContain('保存失败');
});
