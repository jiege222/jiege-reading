import { expect, it } from 'vitest';
import { logicalToPhysical, MAX_SCROLL_HEIGHT, physicalHeight, physicalToLogical } from '../../src/reader/scroll';

it('does not scale ordinary books or empty viewports', () => {
  expect(physicalToLogical(3000, 10000, 800)).toBe(3000);
  expect(logicalToPhysical(3000, 10000, 800)).toBe(3000);
  expect(physicalHeight(1000)).toBe(1000);
  expect(physicalToLogical(0, 0, 800)).toBe(0);
});
it('roundtrips huge books, maps the full scrollbar and caps CSS coordinates', () => {
  const total = 130_000_000;
  expect(physicalHeight(total)).toBe(MAX_SCROLL_HEIGHT);
  for (const ratio of [0, .1, .5, .7, .99, 1]) {
    const logical = (total - 800) * ratio;
    const physical = logicalToPhysical(logical, total, 800);
    expect(physical).toBeLessThanOrEqual(MAX_SCROLL_HEIGHT - 800);
    expect(physicalToLogical(physical, total, 800)).toBeCloseTo(logical, 4);
  }
  expect(logicalToPhysical(total * 2, total, 800)).toBe(MAX_SCROLL_HEIGHT - 800);
});
