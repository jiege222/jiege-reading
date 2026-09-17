import type { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = { id: 'reading', fontSize: 20, lineHeight: 1.9, theme: 'light' };

export function validSettings(value: unknown): Settings {
  const data = (value ?? {}) as Partial<Settings>;
  return {
    id: 'reading',
    fontSize: typeof data.fontSize === 'number' && Number.isFinite(data.fontSize) && data.fontSize >= 14 && data.fontSize <= 32 ? data.fontSize : DEFAULT_SETTINGS.fontSize,
    lineHeight: typeof data.lineHeight === 'number' && Number.isFinite(data.lineHeight) && data.lineHeight >= 1.4 && data.lineHeight <= 2.6 ? data.lineHeight : DEFAULT_SETTINGS.lineHeight,
    theme: data.theme === 'dark' ? 'dark' : 'light',
  };
}
