import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, ParsedText, Progress, Settings, TextBlock } from '../types';
import { validSettings } from './settings';
import { clampOffset } from '../reader/text';

export const DB_NAME = 'jiege-reading';
interface ReadingDB extends DBSchema {
  books: { key: string; value: Book; indexes: { lastReadAt: number } };
  blocks: { key: [string, number]; value: TextBlock; indexes: { bookId: string } };
  progress: { key: string; value: Progress };
  settings: { key: string; value: Settings };
}
let database: Promise<IDBPDatabase<ReadingDB>> | undefined;

export function getDB() {
  if (!database) {
    database = openDB<ReadingDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('books', { keyPath: 'id' }).createIndex('lastReadAt', 'lastReadAt');
        db.createObjectStore('blocks', { keyPath: ['bookId', 'blockIndex'] }).createIndex('bookId', 'bookId');
        db.createObjectStore('progress', { keyPath: 'bookId' });
        db.createObjectStore('settings', { keyPath: 'id' });
      },
      blocked() { window.dispatchEvent(new CustomEvent('storage-blocked')); },
      blocking(_current, _next, event) { (event.target as IDBDatabase).close(); database = undefined; },
      terminated() { database = undefined; },
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

export async function listBooks(): Promise<Book[]> {
  const books = await (await getDB()).getAll('books');
  return books.sort((a, b) => b.lastReadAt - a.lastReadAt || b.importedAt - a.importedAt);
}

export async function importBook(title: string, byteSize: number, parsed: ParsedText): Promise<Book> {
  const now = Date.now();
  const book: Book = {
    id: crypto.randomUUID(), title, byteSize, encoding: parsed.encoding, importedAt: now, lastReadAt: now,
    textLength: parsed.textLength, blockCount: parsed.blocks.length,
    blockInfo: parsed.blocks.map(block => ({ startOffset: block.startOffset, length: block.text.length, lines: block.text.split('\n').length })),
  };
  const db = await getDB();
  const tx = db.transaction(['books', 'blocks', 'progress'], 'readwrite');
  const requests: Promise<unknown>[] = [];
  try {
    requests.push(tx.objectStore('books').add(book));
    requests.push(tx.objectStore('progress').add({ bookId: book.id, textOffset: 0, updatedAt: now }));
    for (const block of parsed.blocks) requests.push(tx.objectStore('blocks').add({ ...block, bookId: book.id }));
    await Promise.all([...requests, tx.done]);
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted. */ }
    await Promise.allSettled([...requests, tx.done]);
    throw error;
  }
  return book;
}

export async function deleteBook(bookId: string) {
  const tx = (await getDB()).transaction(['books', 'blocks', 'progress'], 'readwrite');
  const requests: Promise<unknown>[] = [];
  try {
    const keys = await tx.objectStore('blocks').index('bookId').getAllKeys(bookId);
    requests.push(tx.objectStore('books').delete(bookId));
    requests.push(tx.objectStore('progress').delete(bookId));
    for (const key of keys) requests.push(tx.objectStore('blocks').delete(key));
    await Promise.all([...requests, tx.done]);
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted. */ }
    await Promise.allSettled([...requests, tx.done]);
    throw error;
  }
}

export async function readBlocks(bookId: string, first: number, last: number): Promise<TextBlock[]> {
  return (await getDB()).getAll('blocks', IDBKeyRange.bound([bookId, first], [bookId, last]));
}
export async function readProgress(bookId: string) { return (await getDB()).get('progress', bookId); }

export async function saveProgress(bookId: string, offset: number) {
  const tx = (await getDB()).transaction(['books', 'progress'], 'readwrite');
  const requests: Promise<unknown>[] = [];
  try {
    const book = await tx.objectStore('books').get(bookId);
    if (book) {
      const now = Date.now();
      requests.push(tx.objectStore('progress').put({ bookId, textOffset: clampOffset(offset, book.textLength), updatedAt: now }));
      requests.push(tx.objectStore('books').put({ ...book, lastReadAt: now }));
    }
    await Promise.all([...requests, tx.done]);
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted. */ }
    await Promise.allSettled([...requests, tx.done]);
    throw error;
  }
}

export async function loadSettings() { return validSettings(await (await getDB()).get('settings', 'reading')); }
export async function saveSettings(settings: Settings) { await (await getDB()).put('settings', validSettings(settings)); }

/** Coalesce pending snapshots, serialize writes and retain the latest failed one for retry. */
export function createProgressWriter(write: (offset: number) => Promise<void>) {
  let pending: number | undefined;
  let running: Promise<void> | undefined;
  function drain(): Promise<void> {
    if (running) return running;
    running = (async () => {
      while (pending !== undefined) {
        const current = pending;
        pending = undefined;
        try { await write(current); }
        catch (error) { if (pending === undefined) pending = current; throw error; }
      }
    })().finally(() => { running = undefined; });
    return running;
  }
  return { save(offset: number) { pending = offset; return drain(); }, flush: drain };
}

export async function closeDB() {
  if (database) (await database).close();
  database = undefined;
}
