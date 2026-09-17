import type { Encoding, ParsedText } from '../types';
import { normalizeText, splitText } from '../reader/text';

export function validateFile(file: { name: string; size: number }) {
  if (!/\.txt$/i.test(file.name)) throw new Error('请选择 TXT 文件，暂不支持其他格式。');
  if (file.size === 0) throw new Error('这个文件是空的，请选择有正文的 TXT 文件。');
}

export function parseBytes(bytes: ArrayBuffer, selected?: Encoding): ParsedText {
  if (!bytes.byteLength) throw new Error('这个文件是空的，请选择有正文的 TXT 文件。');
  let encoding: Encoding = selected ?? 'utf-8';
  let decoded: string;
  if (selected) {
    // Manual decoding permits replacement characters, so users can preview and correct it.
    decoded = new TextDecoder(selected).decode(bytes);
  } else {
    const view = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
    const bom = view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      if (bom) throw new Error('UTF-8 文件包含损坏的字节，请手动切换编码或检查原文件。');
      encoding = 'gbk';
      decoded = new TextDecoder('gbk').decode(bytes);
    }
  }
  const text = normalizeText(decoded);
  if (!text.trim()) throw new Error('文件中只有空白，没有可阅读的正文。');
  let controls = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) controls++;
  }
  if (controls / text.length > 0.01) throw new Error('文件包含大量二进制字符，请确认它是纯文本 TXT 文件。');
  return { encoding, blocks: splitText(text), textLength: text.length, preview: text.slice(0, 1200) };
}
