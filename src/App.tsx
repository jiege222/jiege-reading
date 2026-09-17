import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, Settings } from './types';
import { listBooks, loadSettings, saveSettings } from './storage/db';
import { DEFAULT_SETTINGS } from './storage/settings';
import { storageError } from './storage/errors';
import { Bookshelf } from './pages/Bookshelf';
import { Reader } from './pages/Reader';
import { SettingsPanel } from './components/SettingsPanel';

export default function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('设置已保存');
  const settingsRevision = useRef(0);
  const settingsQueue = useRef(Promise.resolve());
  const refresh = useCallback(async () => { setBooks(await listBooks()); }, []);
  const initialize = useCallback(async () => {
    setLoading(true); setError('');
    try { const [, stored] = await Promise.all([refresh(), loadSettings()]); setSettings(stored); setInitialized(true); }
    catch (err) { setError(`无法打开本地书架。${storageError(err)}`); }
    finally { setLoading(false); }
  }, [refresh]);
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => {
    const blocked = () => setError('数据库升级被其他页面阻塞，请关闭其他阅读标签页后重试。');
    window.addEventListener('storage-blocked', blocked);
    return () => window.removeEventListener('storage-blocked', blocked);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);

  useEffect(() => {
    if (!initialized || settingsRevision.current === 0) return;
    const revision = settingsRevision.current;
    const timer = setTimeout(() => {
      settingsQueue.current = settingsQueue.current.catch(() => undefined).then(() => saveSettings(settings));
      void settingsQueue.current.then(() => {
        if (revision === settingsRevision.current) { setSettingsStatus('设置已保存'); setError(''); }
      }).catch(err => { if (revision === settingsRevision.current) { setSettingsStatus('设置尚未保存'); setError(`设置尚未保存。${storageError(err)}`); } });
    }, 250);
    return () => clearTimeout(timer);
  }, [settings, initialized]);

  return <>
    {error && <div className="app-error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { if (!initialized) void initialize(); else { settingsRevision.current++; setSettings({ ...settings }); } }}>重试</button></div>}
    {book ? <Reader key={book.id} book={book} settings={settings} onSettings={() => setSettingsOpen(true)} onBack={async () => { await refresh(); setBook(undefined); }} /> : <Bookshelf books={books} loading={loading} onOpen={setBook} onRefresh={refresh} onSettings={() => setSettingsOpen(true)} />}
    {settingsOpen && <SettingsPanel settings={settings} status={settingsStatus} onChange={value => { settingsRevision.current++; setSettingsStatus('正在保存设置…'); setSettings(value); }} onClose={() => setSettingsOpen(false)} />}
  </>;
}
