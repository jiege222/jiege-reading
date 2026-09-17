export function storageError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'QuotaExceededError') return '浏览器存储空间不足。请删除不需要的书籍，或释放浏览器空间后重试。';
  if (name === 'VersionError') return '当前页面版本较旧，请关闭其他阅读页面并刷新后重试。';
  return '本地保存失败。请检查浏览器是否允许存储，保留原始 TXT 文件后重试。';
}
