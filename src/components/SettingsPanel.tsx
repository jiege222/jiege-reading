import type { Settings } from '../types';
import { Modal } from './Modal';
import { Icon } from './Icon';

export function SettingsPanel({ settings, onChange, onClose, status }: { settings: Settings; onChange: (settings: Settings) => void; onClose: () => void; status: string }) {
  return <Modal title="阅读设置" onClose={onClose}>
    <div className="setting-group"><label htmlFor="font-size">字号 <span>{settings.fontSize} px</span></label><input id="font-size" type="range" min="14" max="32" step="1" value={settings.fontSize} onChange={e => onChange({ ...settings, fontSize: Number(e.target.value) })} /><div className="range-labels"><span>小</span><span>大</span></div></div>
    <div className="setting-group"><label htmlFor="line-height">行距 <span>{settings.lineHeight.toFixed(1)} 倍</span></label><input id="line-height" type="range" min="1.4" max="2.6" step="0.1" value={settings.lineHeight} onChange={e => onChange({ ...settings, lineHeight: Number(e.target.value) })} /><div className="range-labels"><span>紧凑</span><span>舒展</span></div></div>
    <div className="setting-group"><p className="setting-label">阅读主题</p><div className="theme-options"><button className={settings.theme === 'light' ? 'theme-option selected' : 'theme-option'} aria-pressed={settings.theme === 'light'} onClick={() => onChange({ ...settings, theme: 'light' })}><Icon name="sun" />浅色</button><button className={settings.theme === 'dark' ? 'theme-option selected' : 'theme-option'} aria-pressed={settings.theme === 'dark'} onClick={() => onChange({ ...settings, theme: 'dark' })}><Icon name="moon" />深色</button></div></div>
    <div className="setting-preview" style={{ fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>翻开一页书，<br />把片刻安静留给自己。</div>
    <p className="helper" role="status">{status} · 设置应用于所有书籍</p>
  </Modal>;
}
