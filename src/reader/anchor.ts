import { safeBoundary } from './text';

export function characterRect(element: HTMLElement, offset: number): DOMRect | null {
  const node = element.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? '';
  if (!text.length) return null;
  const start = safeBoundary(text, Math.min(offset, text.length - 1));
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, Math.min(text.length, start + (text.codePointAt(start)! > 0xffff ? 2 : 1)));
  return range.getBoundingClientRect();
}

/** Binary search a monotonic sequence of line rectangles; UTF-16 is shared with the DB. */
export function offsetAtTop(element: HTMLElement, top: number): number {
  const text = element.textContent ?? '';
  let low = 0;
  let high = Math.max(0, text.length - 1);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const rect = characterRect(element, mid);
    if (!rect || rect.bottom > top) high = mid;
    else low = mid + 1;
  }
  return safeBoundary(text, low);
}

export function visibleAnchor(viewport: HTMLElement): number | undefined {
  const top = viewport.getBoundingClientRect().top + 8;
  const elements = viewport.querySelectorAll<HTMLElement>('[data-text-start]');
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom > top && rect.top < viewport.getBoundingClientRect().bottom) {
      return Number(element.dataset.textStart) + offsetAtTop(element, top);
    }
  }
  return undefined;
}
