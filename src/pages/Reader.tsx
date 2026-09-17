import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { elementScroll, observeElementOffset, useVirtualizer } from '@tanstack/react-virtual';
import type { Book, Settings, TextBlock } from '../types';
import { createProgressWriter, readBlocks, readProgress, saveProgress } from '../storage/db';
import { storageError } from '../storage/errors';
import { clampOffset, findBlock, safeBoundary } from '../reader/text';
import { characterRect, visibleAnchor } from '../reader/anchor';
import { Icon } from '../components/Icon';
import { logicalToPhysical, physicalHeight, physicalToLogical } from '../reader/scroll';

export function Reader({ book, settings, onSettings, onBack }: { book: Book; settings: Settings; onSettings: () => void; onBack: () => Promise<void> }) {
  const viewport = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<number, TextBlock>());
  const [cacheVersion, setCacheVersion] = useState(0);
  const [width, setWidth] = useState(700);
  const [pending, setPending] = useState<{ offset: number; serial: number }>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [blockError, setBlockError] = useState('');
  const [progressReadError, setProgressReadError] = useState('');
  const [saveState, setSaveState] = useState('自动保存阅读位置');
  const [percent, setPercent] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [readRetry, setReadRetry] = useState(0);
  const anchor = useRef(0);
  const restoring = useRef(true);
  const restoreSerial = useRef(0);
  const lastSaved = useRef(-1);
  const active = useRef(true);
  const writer = useMemo(() => createProgressWriter(offset => saveProgress(book.id, offset)), [book.id]);
  const reportError = useCallback((err: unknown) => { if (active.current) { setError(storageError(err)); setSaveState('进度尚未保存'); } }, []);

  const estimateSize = useCallback((index: number) => {
    const info = book.blockInfo[index];
    const charsPerLine = Math.max(8, Math.floor(width / settings.fontSize));
    return Math.max(1, info.lines + Math.ceil(info.length / charsPerLine)) * settings.fontSize * settings.lineHeight;
  }, [book.blockInfo, width, settings.fontSize, settings.lineHeight]);
  const virtual = useVirtualizer({
    count: book.blockCount, getScrollElement: () => viewport.current, estimateSize, overscan: 3,
    paddingStart: 40, paddingEnd: 120,
    useAnimationFrameWithResizeObserver: false,
    observeElementOffset: (instance, callback) => observeElementOffset(instance, (offset, scrolling) => {
      callback(physicalToLogical(offset, instance.getTotalSize(), instance.scrollRect?.height ?? 0), scrolling);
    }),
    scrollToFn: (offset, options, instance) => {
      elementScroll(logicalToPhysical(offset + (options.adjustments ?? 0), instance.getTotalSize(), instance.scrollRect?.height ?? 0), { ...options, adjustments: 0 }, instance);
    },
  });
  virtual.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
    if (restoring.current || item.start + item.size > (instance.scrollOffset ?? 0)) return false;
    const view = viewport.current;
    const total = instance.getTotalSize();
    if (view && total > physicalHeight(total)) {
      view.scrollTop = logicalToPhysical((instance.scrollOffset ?? 0) + _delta, total + _delta, view.clientHeight);
      return false;
    }
    return true;
  };
  const physicalOffset = viewport.current?.scrollTop ?? 0;
  const scrollAdjustment = physicalToLogical(physicalOffset, virtual.getTotalSize(), viewport.current?.clientHeight ?? 0) - physicalOffset;
  const items = virtual.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items.at(-1)?.index ?? 0;
  const target = pending ? findBlock(book.blockInfo, pending.offset) : -1;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ranges: [number, number][] = [[first, last]];
      if (target >= 0 && (target < first || target > last)) ranges.push([target, target]);
      const loaded = await Promise.all(ranges.filter(([a, b]) => {
        for (let i = a; i <= b; i++) if (!cache.current.has(i)) return true;
        return false;
      }).map(([a, b]) => readBlocks(book.id, a, b)));
      if (cancelled || !loaded.length) return;
      for (const blocks of loaded) for (const block of blocks) cache.current.set(block.blockIndex, block);
      // Keep a bounded LRU-like neighbourhood, never load an entire book to open it.
      if (cache.current.size > 40) {
        for (const key of cache.current.keys()) {
          if ((key < first - 5 || key > last + 5) && key !== target) cache.current.delete(key);
          if (cache.current.size <= 40) break;
        }
      }
      setCacheVersion(value => value + 1);
      setBlockError('');
    };
    void load().catch(err => { if (!cancelled) setBlockError(`正文读取失败。${storageError(err)}`); });
    return () => { cancelled = true; };
  }, [book.id, first, last, target, readRetry]);

  const restore = useCallback((offset: number) => {
    restoring.current = true;
    const clamped = clampOffset(offset, book.textLength);
    anchor.current = clamped;
    setPending({ offset: clamped, serial: ++restoreSerial.current });
  }, [book.textLength]);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    void readProgress(book.id).then(progress => {
      if (cancelled) return;
      anchor.current = clampOffset(progress?.textOffset ?? 0, book.textLength);
      lastSaved.current = anchor.current;
      setProgressReadError('');
      setReady(true); restore(anchor.current);
      // Opening a book counts as recent reading even before the first scroll.
      void writer.save(anchor.current).catch(reportError);
    }).catch(err => { if (!cancelled) setProgressReadError(`阅读位置读取失败。${storageError(err)}`); });
    return () => { cancelled = true; active.current = false; };
  }, [book.id, book.textLength, writer, restore, reportError, readRetry]);

  useLayoutEffect(() => {
    if (!ready) return;
    restore(anchor.current);
    virtual.measure();
  // Virtualizer identity is stable; measure only after actual layout changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.fontSize, settings.lineHeight, width, ready, restore]);

  useEffect(() => {
    if (!column.current) return;
    const observer = new ResizeObserver(entries => {
      const newWidth = Math.round(entries[0].contentRect.width);
      setWidth(previous => newWidth > 0 && previous !== newWidth ? newWidth : previous);
    });
    observer.observe(column.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pending || !ready || target < 0) return;
    const current = pending;
    let cancelled = false;
    let raf = 0;
    // Native scroll limits must not clamp logical targets in huge books.
    // Measurements contain logical positions even when the CSS sizer is capped.
    const jump = (logical: number) => {
      const view = viewport.current;
      if (view) view.scrollTop = logicalToPhysical(logical, virtual.getTotalSize(), view.clientHeight);
    };
    jump(virtual.measurementsCache[target]?.start ?? 0);
    let attempts = 0;
    let stable = 0;
    const correct = () => {
      if (cancelled || current.serial !== restoreSerial.current) return;
      const view = viewport.current;
      // measure() invalidates cached sizes even for DOM nodes whose dimensions
      // did not change. Re-measure explicitly rather than waiting for a RO event
      // that may never fire (notably on reopening or container-width changes).
      if (view) {
        const measurements = Array.from(view.querySelectorAll<HTMLElement>('[data-index]')).map(element => ({ index: Number(element.dataset.index), height: element.getBoundingClientRect().height }));
        flushSync(() => {
          for (const measurement of measurements) virtual.resizeItem(measurement.index, measurement.height);
          virtual.getTotalSize();
        });
      }
      const block = cache.current.get(target);
      const element = view?.querySelector<HTMLElement>(`[data-text-start="${book.blockInfo[target].startOffset}"]`);
      if (view && element && block) {
        const local = safeBoundary(block.text, current.offset - block.startOffset);
        const rect = characterRect(element, local);
        if (rect) {
          const delta = rect.top - view.getBoundingClientRect().top - 8;
          const bottomClamped = view.scrollTop >= view.scrollHeight - view.clientHeight - 1 && rect.bottom <= view.getBoundingClientRect().bottom;
          if (Math.abs(delta) > 1 && !bottomClamped) { jump(physicalToLogical(view.scrollTop, virtual.getTotalSize(), view.clientHeight) + delta); stable = 0; }
          else stable++;
          const allLoaded = virtual.getVirtualItems().every(item => cache.current.has(item.index));
          if (allLoaded && (stable >= 12 || (view.scrollTop === 0 && current.offset === 0))) {
            restoring.current = false;
            anchor.current = current.offset;
            setPercent(current.offset / Math.max(1, book.textLength) * 100);
            setPending(value => value?.serial === current.serial ? undefined : value);
            return;
          }
        }
      }
      if (++attempts < 240) raf = requestAnimationFrame(correct);
      else { restoring.current = false; setPending(value => value?.serial === current.serial ? undefined : value); }
    };
    raf = requestAnimationFrame(correct);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [pending, target, ready, cacheVersion, virtual, book.blockInfo, book.textLength]);

  const sample = useCallback(() => {
    if (restoring.current || !ready || !viewport.current) return;
    const offset = visibleAnchor(viewport.current);
    if (offset !== undefined) { anchor.current = clampOffset(offset, book.textLength); setPercent(anchor.current / book.textLength * 100); }
  }, [book.textLength, ready]);

  const persist = useCallback(async (force = false) => {
    if (!ready) return;
    sample();
    const offset = anchor.current;
    if (!force && offset === lastSaved.current) return;
    try {
      await writer.save(offset);
      lastSaved.current = offset;
      if (active.current) { setSaveState('阅读位置已保存'); setError(''); }
    } catch (err) { reportError(err); throw err; }
  }, [ready, sample, writer, reportError]);

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => { if (!timer) timer = setTimeout(() => { timer = undefined; sample(); }, 120); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') void persist(true).catch(() => undefined); };
    view.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(() => { void persist().catch(() => undefined); }, 1000);
    return () => { view.removeEventListener('scroll', onScroll); document.removeEventListener('visibilitychange', onVisibility); clearInterval(interval); clearTimeout(timer); };
  }, [sample, persist]);

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    const move = (delta: number) => {
      const total = virtual.getTotalSize();
      const logical = physicalToLogical(view.scrollTop, total, view.clientHeight);
      view.scrollTop = logicalToPhysical(logical + delta, total, view.clientHeight);
    };
    const wheel = (event: WheelEvent) => {
      if (virtual.getTotalSize() <= physicalHeight(virtual.getTotalSize()) || event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      move(event.deltaY * (event.deltaMode === 1 ? settings.fontSize * settings.lineHeight : event.deltaMode === 2 ? view.clientHeight : 1));
    };
    const key = (event: KeyboardEvent) => {
      if (virtual.getTotalSize() <= physicalHeight(virtual.getTotalSize())) return;
      const delta = { ArrowDown: 40, ArrowUp: -40, PageDown: view.clientHeight * .9, PageUp: -view.clientHeight * .9, ' ': view.clientHeight * (event.shiftKey ? -.9 : .9), Home: -virtual.getTotalSize(), End: virtual.getTotalSize() }[event.key];
      if (delta !== undefined) { event.preventDefault(); move(delta); }
    };
    view.addEventListener('wheel', wheel, { passive: false });
    view.addEventListener('keydown', key);
    return () => { view.removeEventListener('wheel', wheel); view.removeEventListener('keydown', key); };
  }, [virtual, settings.fontSize, settings.lineHeight]);

  async function back() {
    if (leaving) return;
    setLeaving(true);
    try { await persist(true); await writer.flush(); await onBack(); }
    catch (err) { reportError(err); }
    finally { if (active.current) setLeaving(false); }
  }

  return <div className="reader-page">
    <header className="reader-header"><button className="back-button" onClick={back} disabled={leaving}><Icon name="back" /><span>{leaving ? '正在保存…' : '返回书架'}</span></button><h1>{book.title}</h1><button className="header-settings" aria-label="阅读设置" onClick={() => { sample(); onSettings(); }}><Icon name="settings" /><span>阅读设置</span></button></header>
    {(error || blockError || progressReadError) && <div className="reader-error" role="alert">{[error, blockError, progressReadError].filter(Boolean).join(' ')}{error && <button className="text-button" onClick={() => { void persist(true).catch(() => undefined); }}>重试保存</button>}{(blockError || progressReadError) && <button className="text-button" onClick={() => { setBlockError(''); setProgressReadError(''); setReadRetry(x => x + 1); }}>重试读取</button>}</div>}
    <div ref={viewport} className="reader-viewport" data-testid="reader-viewport" data-logical-height={virtual.getTotalSize()} data-logical-offset={virtual.scrollOffset ?? 0} tabIndex={0} aria-label="书籍正文" aria-busy={!ready || !!pending} onWheel={() => { if (ready && pending) { restoring.current = false; setPending(undefined); } }} onTouchStart={() => { if (ready && pending) { restoring.current = false; setPending(undefined); } }}>
      <div ref={column} className="reader-column" style={{ fontSize: settings.fontSize, lineHeight: settings.lineHeight, height: physicalHeight(virtual.getTotalSize()) }}>
        {items.map(item => {
          const block = cache.current.get(item.index);
          return <div key={item.key} data-index={item.index} ref={virtual.measureElement} className="text-block" style={{ transform: `translateY(${item.start - scrollAdjustment}px)` }}>
            {block ? <div data-text-start={block.startOffset}>{block.text}</div> : <div className="block-loading" style={{ height: estimateSize(item.index) }} role="status">正在加载正文…</div>}
          </div>;
        })}
      </div>
      {!ready && <div className="reader-loading" role="status"><span className="spinner" />正在恢复阅读位置…</div>}
    </div>
    <footer className="reader-footer"><span role="status">{saveState}</span><span>{percent.toFixed(1)}% <span className="footer-dot">·</span> {book.encoding.toUpperCase()}</span></footer>
  </div>;
}
