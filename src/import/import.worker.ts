import { readFile } from './readFile';
import type { Encoding } from '../types';

self.onmessage = async (event: MessageEvent<{ file: File; encoding?: Encoding }>) => {
  try {
    const result = await readFile(event.data.file, event.data.encoding, message => self.postMessage({ type: 'status', message }));
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '导入失败，请重试。' });
  }
};
