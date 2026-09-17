export type Encoding = 'utf-8' | 'gbk';
export type Settings = { id: 'reading'; fontSize: number; lineHeight: number; theme: 'light' | 'dark' };
export type BlockInfo = { startOffset: number; length: number; lines: number };
export type Book = {
  id: string;
  title: string;
  encoding: Encoding;
  byteSize: number;
  importedAt: number;
  lastReadAt: number;
  textLength: number;
  blockCount: number;
  blockInfo: BlockInfo[];
};
export type TextBlock = { bookId: string; blockIndex: number; startOffset: number; text: string };
export type Progress = { bookId: string; textOffset: number; updatedAt: number };
export type ParsedText = { encoding: Encoding; blocks: Omit<TextBlock, 'bookId'>[]; textLength: number; preview: string };
