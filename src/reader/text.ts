import type { BlockInfo, ParsedText } from '../types';

export const BLOCK_TARGET = 3000;

export function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** Return a UTF-16 boundary without splitting an astral character. */
export function safeBoundary(text: string, offset: number): number {
  const index = Math.max(0, Math.min(text.length, Math.floor(offset)));
  if (index > 0 && index < text.length && /[\uD800-\uDBFF]/.test(text[index - 1]) && /[\uDC00-\uDFFF]/.test(text[index])) return index - 1;
  return index;
}

export function splitText(text: string): ParsedText['blocks'] {
  const blocks: ParsedText['blocks'] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + BLOCK_TARGET, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end);
      if (newline >= start + 2000) end = newline + 1;
      else {
        const next = text.indexOf('\n', end);
        if (next !== -1 && next < start + 4000) end = next + 1;
      }
    }
    end = safeBoundary(text, end);
    blocks.push({ blockIndex: blocks.length, startOffset: start, text: text.slice(start, end) });
    start = end;
  }
  return blocks;
}

export function clampOffset(offset: number, length: number): number {
  return Number.isFinite(offset) ? Math.max(0, Math.min(Math.max(0, length - 1), Math.floor(offset))) : 0;
}

export function findBlock(infos: BlockInfo[], offset: number): number {
  let low = 0;
  let high = infos.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (infos[mid].startOffset <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}
