// Keep CSS height below the coordinate limits of all supported browser engines.
// The virtualizer keeps logical coordinates; only the scrollbar uses capped coordinates.
export const MAX_SCROLL_HEIGHT = 16_000_000;

export function physicalHeight(total: number) { return Math.min(total, MAX_SCROLL_HEIGHT); }
export function physicalToLogical(offset: number, total: number, viewport: number) {
  const physicalMax = Math.max(0, physicalHeight(total) - viewport);
  const logicalMax = Math.max(0, total - viewport);
  if (!physicalMax || logicalMax === physicalMax) return offset;
  return Math.max(0, Math.min(physicalMax, offset)) * logicalMax / physicalMax;
}
export function logicalToPhysical(offset: number, total: number, viewport: number) {
  const logicalMax = Math.max(0, total - viewport);
  const physicalMax = Math.max(0, physicalHeight(total) - viewport);
  if (!logicalMax || logicalMax === physicalMax) return offset;
  return Math.max(0, Math.min(logicalMax, offset)) * physicalMax / logicalMax;
}
