import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-heading"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose} disabled={busy}><Icon name="close" /></button></div>
    {children}
  </dialog>;
}
