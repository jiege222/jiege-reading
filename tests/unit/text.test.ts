import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { parseBytes, validateFile } from '../../src/import/decode';
import { clampOffset, findBlock, normalizeText, safeBoundary, splitText } from '../../src/reader/text';
import { readFile } from '../../src/import/readFile';

function bytes(text: string, encoding = 'utf-8'): ArrayBuffer {
  return Uint8Array.from(iconv.encode(text, encoding)).buffer;
}

describe('TXT import', () => {
  it('explains file read failure and emits processing stages on success', async () => {
    const broken = { name: 'broken.txt', size: 100, arrayBuffer: async () => { throw new Error('disk'); } } as unknown as File;
    await expect(readFile(broken)).rejects.toThrow('文件读取失败');
    const stages: string[] = [];
    const file = { name: '正常.txt', size: 30, arrayBuffer: async () => bytes('中文') } as File;
    expect((await readFile(file, undefined, message => stages.push(message))).preview).toBe('中文');
    expect(stages).toEqual(['正在读取文件…', '正在解码和整理正文…']);
  });
  it.each(['utf-8', 'gbk'])('decodes Chinese %s and preserves normalized paragraphs', encoding => {
    const parsed = parseBytes(bytes('第一章\r\n你好，世界！\r\n\r\n故事开始。\r最后一行', encoding));
    expect(parsed.encoding).toBe(encoding);
    expect(parsed.blocks.map(block => block.text).join('')).toBe('第一章\n你好，世界！\n\n故事开始。\n最后一行');
  });
  it('handles UTF-8 BOM and manual override from original bytes', () => {
    expect(parseBytes(bytes('\ufeff中文😀')).preview).toBe('中文😀');
    const source = bytes('中文故事', 'gbk');
    expect(parseBytes(source, 'utf-8').preview).toContain('�');
    expect(parseBytes(source, 'gbk').preview).toBe('中文故事');
  });
  it('prioritizes a BOM instead of silently treating damaged UTF-8 as GBK', () => {
    expect(() => parseBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0xff]).buffer)).toThrow('损坏');
  });
  it('accepts case-insensitive TXT extensions regardless of MIME', () => {
    expect(() => validateFile({ name: '小说.TXT', size: 30 })).not.toThrow();
    expect(() => validateFile({ name: '小说.pdf', size: 30 })).toThrow('TXT');
    expect(() => validateFile({ name: '空.txt', size: 0 })).toThrow('空');
  });
  it('rejects empty, whitespace and binary content', () => {
    expect(() => parseBytes(new ArrayBuffer(0))).toThrow('空');
    expect(() => parseBytes(bytes('\ufeff \t\r\n'))).toThrow('空白');
    expect(() => parseBytes(bytes('hello\x00\x01\x02world'))).toThrow('二进制');
  });
});

describe('text chunks and UTF-16 anchors', () => {
  it.each([
    '段落\n\n中文与😀\n'.repeat(3000),
    '长段落😀'.repeat(7000),
    '😀'.repeat(2000) + '\n\n尾声',
    'a'.repeat(2999) + '😀结尾',
  ])('roundtrips blocks without gaps or damaged surrogate pairs', source => {
    const text = normalizeText(source);
    const blocks = splitText(text);
    expect(blocks.map(block => block.text).join('')).toBe(text);
    let offset = 0;
    for (const [index, block] of blocks.entries()) {
      expect(block.blockIndex).toBe(index);
      expect(block.startOffset).toBe(offset);
      expect(block.text.length).toBeLessThanOrEqual(4000);
      expect(block.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
      offset += block.text.length;
    }
  });
  it('maps offset boundaries and clamps invalid progress', () => {
    const infos = splitText('正文\n'.repeat(4000)).map(block => ({ startOffset: block.startOffset, length: block.text.length, lines: 1 }));
    for (const [i, info] of infos.entries()) {
      expect(findBlock(infos, info.startOffset)).toBe(i);
      expect(findBlock(infos, info.startOffset + info.length - 1)).toBe(i);
    }
    expect(clampOffset(-3, 20)).toBe(0);
    expect(clampOffset(Infinity, 20)).toBe(0);
    expect(clampOffset(100, 20)).toBe(19);
    expect(clampOffset(1, 0)).toBe(0);
    expect(safeBoundary('a😀b', 2)).toBe(1);
  });
});
