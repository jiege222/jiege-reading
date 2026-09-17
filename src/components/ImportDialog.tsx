import { useEffect, useRef, useState } from 'react';
import type { Book, Encoding, ParsedText } from '../types';
import { importBook } from '../storage/db';
import { storageError } from '../storage/errors';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { formatSize } from '../format';

export function ImportDialog({ file, onClose, onImported, onChoose }: { file: File; onClose: () => void; onImported: (book: Book) => void; onChoose: () => void }) {
  const [encoding, setEncoding] = useState<Encoding | undefined>();
  const [parsed, setParsed] = useState<ParsedText>();
  const [status, setStatus] = useState('正在读取文件…');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    setParsed(undefined); setError(''); setStatus('正在读取文件…');
    const worker = new Worker(new URL('../import/import.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = event => {
      if (event.data.type === 'status') setStatus(event.data.message);
      if (event.data.type === 'result') { setParsed(event.data.result); setStatus(''); }
      if (event.data.type === 'error') { setError(event.data.message); setStatus(''); }
    };
    worker.onerror = () => { setStatus(''); setError('文件处理失败，请重新选择文件或重试。'); };
    worker.postMessage({ file, encoding });
    return () => { worker.terminate(); workerRef.current = null; };
  }, [file, encoding, retry]);

  async function confirm() {
    if (!parsed || saving) return;
    setSaving(true); setError('');
    try {
      const book = await importBook(file.name.replace(/\.txt$/i, ''), file.size, parsed);
      // Persistence is a best-effort request; it is never required for reading.
      void navigator.storage?.persist?.().catch(() => undefined);
      onImported(book);
    } catch (err) { setError(storageError(err)); setSaving(false); }
  }
  return <Modal title="导入一本书" onClose={onClose} busy={saving}>
    <div className="file-summary"><span className="file-icon"><Icon name="book" size={24} /></span><div><strong>{file.name}</strong><span>{formatSize(file.size)} · TXT 文本</span></div></div>
    <div className="encoding-row"><label htmlFor="encoding">文本编码</label><select id="encoding" value={encoding ?? 'auto'} onChange={e => setEncoding(e.target.value === 'auto' ? undefined : e.target.value as Encoding)} disabled={saving}><option value="auto">自动识别</option><option value="utf-8">UTF-8</option><option value="gbk">GBK</option></select></div>
    <p className="helper">{parsed ? `识别为 ${parsed.encoding.toUpperCase()} · ${parsed.textLength.toLocaleString()} 字符。` : ''}如预览乱码，可以手动切换编码。</p>
    {status && <div className="processing" role="status"><span className="spinner" />{status}</div>}
    {parsed && <><div className="preview-label">正文预览</div><pre className="text-preview">{parsed.preview}</pre></>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    <p className="helper">书籍仅保存到当前浏览器，请保留原始 TXT 文件。已导入的书如需切换编码，请删除后重新导入。</p>
    <div className="modal-actions"><button className="secondary" onClick={onChoose} disabled={saving}>重新选择</button>{!parsed && !status && <button className="secondary" onClick={() => setRetry(x => x + 1)}>重试</button>}<button className="primary" onClick={confirm} disabled={!parsed || !!status || saving}>{saving ? '正在保存…' : '导入并阅读'}<Icon name="arrow" size={18} /></button></div>
  </Modal>;
}
