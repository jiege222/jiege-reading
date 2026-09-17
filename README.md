# 杰哥阅读

一个适配电脑和手机的本地 TXT 阅读器，依据 [产品设计](docs/产品设计-MVP.md) 和 [技术方案](docs/技术方案-MVP.md) 实现。无需账号或业务后端，书籍内容不会上传。

## 运行

需要 Node.js 22.12+ 或 24+、npm。首次安装需要联网。

```powershell
npm.cmd ci
npm.cmd run dev
```

访问固定地址 http://127.0.0.1:5173。选择 TXT 后查看预览，确认编码，再点击“导入并阅读”。支持 UTF-8、GBK 及手动切换编码。阅读时可以调整字号、行距、主题；返回书架前等待进度保存。

书籍、进度、设置保存在当前浏览器的 IndexedDB。请保留原始 TXT 文件；清除浏览器数据、更换设备或访问地址不会自动迁移书籍。自动保存约每秒进行一次，强制结束浏览器可能丢失最近一个保存周期的位置。编码切换只在导入确认时提供，已导入的书如需重新解码，可删除后重新导入。

## 构建与部署

```powershell
npm.cmd run build
npm.cmd run preview
```

生产资源位于 `dist/`，可部署到任意 HTTPS 静态托管服务，无需业务服务器。请保持协议、域名和端口稳定。不要直接双击 `index.html` 运行。本版没有 Service Worker，不承诺断网后重新启动页面。

## 验证

```powershell
# 浏览器二进制缓存放在项目内，不改变全局配置。
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/browsers'
npx.cmd playwright install chromium firefox webkit
npm.cmd run check
npm.cmd run test:stress
```

`check` 包括 TypeScript、Vitest 单元测试、Chromium / Firefox / WebKit / 手机视口的 Playwright 测试、生产构建，以及全部 PowerShell 文档验证脚本。压力测试使用约 1、10、50 MiB 的 UTF-8 / GBK 样本，在测试附件中记录解码、保存、打开耗时、DOM 块数量和主页面 JS 堆快照。该堆快照不是导入峰值内存或浏览器总内存。

Windows 上尚未下载 Playwright Chromium 时，测试可自动使用系统已安装的 Chrome；也可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定测试浏览器路径。测试使用独立临时配置，不读取日常浏览器的书籍。Firefox 在部分 Windows 沙箱环境中需要在沙箱外启动测试进程。

自动化手机视口不能代替真机验证。真实 Android Chrome / iOS Safari 上的文件选择、后台恢复等验收需要在设备上完成，操作清单见 `docs/验收记录.md`。

## 实现结构

- `src/import`：文件检查、编码策略、Worker 读取和分块。
- `src/storage`：schema v1、事务导入与删除、串行进度保存、设置校验。
- `src/reader`：段落分块、UTF-16 偏移映射、DOM Range 内容定位。
- `src/pages`：书架、动态高度虚拟阅读；只读取视口附近正文，缓存限制为 40 块。
- `src/components`：导入预览、设置、确认对话框。
- `tests/unit`、`tests/e2e`、`tests/stress`：逻辑、完整流程、长文件验证。

没有章节目录、搜索、书签、笔记、登录、云同步、AI 或朗读，遵循 MVP 范围。
