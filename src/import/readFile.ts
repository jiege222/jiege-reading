import type { Encoding } from '../types';
import { parseBytes, validateFile } from './decode';

export async function readFile(file: File, encoding?: Encoding, status: (message: string) => void = () => undefined) {
  validateFile(file);
  status('正在读取文件…');
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); }
  catch { throw new Error('文件读取失败，请重新选择文件后重试。'); }
  status('正在解码和整理正文…');
  return parseBytes(bytes, encoding);
}
