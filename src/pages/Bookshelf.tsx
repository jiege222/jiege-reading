import { useRef, useState } from 'react';
import type { Book } from '../types';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { ImportDialog } from '../components/ImportDialog';
import { deleteBook } from '../storage/db';
import { storageError } from '../storage/errors';
import { formatSize, formatTime } from '../format';

export function Bookshelf({ books, loading, onOpen, onRefresh, onSettings }: { books: Book[]; loading: boolean; onOpen: (book: Book) => void; onRefresh: () => Promise<void>; onSettings: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [removing, setRemoving] = useState<Book>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choose = () => input.current?.click();
  async function confirmDelete() {
    if (!removing || busy) return;
    setBusy(true); setError('');
    try { await deleteBook(removing.id); await onRefresh(); setRemoving(undefined); }
    catch (err) { setError(storageError(err)); }
    finally { setBusy(false); }
  }
  return <div className="shelf-page">
    <header className="site-header"><a href="/" className="brand" aria-label="杰哥阅读首页"><span className="brand-mark"><Icon name="book" size={24} /></span><span>杰哥阅读<small>让阅读，回归简单</small></span></a><button className="header-settings" onClick={onSettings}><Icon name="settings" /><span>阅读设置</span></button></header>
    <main className="shelf-main">
      <section className="hero"><div className="hero-copy"><p className="eyebrow"><span />你的私人阅读角落</p><h1>把一本书的时间，<br /><em>留给自己。</em></h1><p className="hero-description">无需登录，无需联网传书。<br />从一份 TXT 开始，随时回来，接着读。</p><button className="primary import-main" onClick={choose} disabled={loading}><Icon name="plus" />导入 TXT 书籍</button><p className="hero-note">支持 UTF-8 / GBK · 书籍只留在本地</p></div><div className="hero-art" aria-hidden="true"><span className="art-ring ring-one" /><span className="art-ring ring-two" /><div className="paper paper-back" /><div className="paper paper-front"><span className="paper-kicker">慢下来 · 读几页</span><span className="paper-title">字里行间<br />自有天地</span><span className="paper-rule" /><span className="paper-caption">A LITTLE TIME FOR YOURSELF</span></div><span className="art-caption">READ AT YOUR OWN PACE</span></div></section>
      <section className="library" aria-labelledby="library-title"><div className="section-heading"><div><h2 id="library-title">我的书架 <span>{books.length.toString().padStart(2, '0')}</span></h2><p>最近读过的书，会在这里等你。</p></div><span className="sort-label">按最近阅读排序</span></div>
        {loading ? <div className="empty-shelf" role="status"><span className="spinner" />正在打开你的书架…</div> : books.length === 0 ? <div className="empty-shelf"><span className="empty-book"><Icon name="book" size={34} /></span><h3>这里，等着你的第一本书</h3><p>导入喜欢的 TXT，让故事从这里开始。</p><button className="text-button" onClick={choose}>选择本地文件<Icon name="arrow" size={17} /></button></div> : <div className="book-grid">{books.map((book, i) => <article className="book-card" key={book.id}><div className={`book-emblem tone-${i % 3}`} aria-hidden="true"><Icon name="book" size={30} /><span>TXT</span></div><div className="book-info"><h3 title={book.title}>{book.title}</h3><p>{formatSize(book.byteSize)} <span>·</span> {book.encoding.toUpperCase()}</p><p className="last-read">最近阅读 · {formatTime(book.lastReadAt)}</p></div><div className="book-actions"><button className="read-button" onClick={() => onOpen(book)} aria-label={`阅读 ${book.title}`}>继续阅读<Icon name="arrow" size={17} /></button><button className="icon-button delete-button" onClick={() => { setRemoving(book); setError(''); }} aria-label={`删除 ${book.title}`}><Icon name="trash" size={17} /></button></div></article>)}</div>}
      </section>
      <aside className="local-note"><Icon name="shield" size={20} /><p><strong>属于你的书，也只在你的浏览器里。</strong>书籍、进度和设置仅保存在当前浏览器。清除浏览器数据或更换设备后无法自动恢复，请保留原始 TXT 文件。</p></aside>
    </main><footer className="site-footer"><span>杰哥阅读</span><span>一份文本，一段安静的时光。</span><span>本地保存 · 无需账号</span></footer>
    <input ref={input} data-testid="file-input" className="visually-hidden" type="file" accept=".txt,text/plain" aria-label="选择 TXT 文件" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = ''; }} />
    {file && <ImportDialog key={`${file.name}-${file.lastModified}`} file={file} onClose={() => setFile(undefined)} onChoose={choose} onImported={book => { setFile(undefined); onOpen(book); }} />}
    {removing && <Modal title="删除这本书？" onClose={() => setRemoving(undefined)} busy={busy}><p className="delete-copy">《{removing.title}》的正文和阅读进度将一起删除。其他书籍不会受影响。</p>{error && <div role="alert" className="inline-error">{error}</div>}<div className="modal-actions"><button className="secondary" onClick={() => setRemoving(undefined)} disabled={busy}>保留这本书</button><button className="danger" onClick={confirmDelete} disabled={busy}>{busy ? '正在删除…' : '确认删除'}</button></div></Modal>}
  </div>;
}
