# OpenConnect VPN GUI（hkproto1 fork）

## v1.2.0

> 升级建议：曾遇到“更换网络后同一 VPN 服务器连不上”的用户请更新到本版本。

### 修复

- 连接前自动清理残留主机路由：上次连接遗留的 `UGHS` 主机路由可能仍指向上一个网络的私网网关，导致 `Can't assign requested address` 并使新网络下无法连接服务器；现在每次连接前自动检测并删除（仅当网关为私网地址且不在当前网段时才删除，避免误删正常路由）
- 清理失败不会阻塞连接；sudo 密码错误时会直接提示并终止

### 新增

- 自动更新检查：
  - 应用启动后静默检查 GitHub Releases，有新版本时发送系统通知
  - 托盘菜单新增「检查更新」，可手动检查并查看更新说明
  - 确认后自动下载 dmg 到「下载」目录并打开，拖入「应用程序」覆盖即可完成升级
  - 应用未签名，因此不会静默替换安装，需手动确认覆盖

### 工程

- 新增 `src/main/routes.js` 与 `src/main/updater.js`，均附带 `node:test` 单测（共 19 条）

### 安装（Apple Silicon）

1. 下载 `OpenConnect VPN-1.2.0-arm64.dmg`
2. 将应用拖入 `/Applications`
3. 本包未签名，首次启动需清除隔离标记：

```bash
xattr -cr "/Applications/OpenConnect VPN.app"
open "/Applications/OpenConnect VPN.app"
```

4. 依赖本机已安装 OpenConnect：`brew install openconnect`
5. 「开机自动启动」需要应用保持固定在 `/Applications`；移动应用后需重新勾选

### 已知限制

- 仅提供 arm64 构建
- 未签名/未公证，首次启动需手动清除 quarantine
- 自动更新为“下载 + 手动覆盖安装”，无法静默替换

## v1.1.1

首个可用版本，在 [jadedm/openconnect-gui](https://github.com/jadedm/openconnect-gui) 基础上二次开发。

### 修复

- 修复 v1.1.0 安装后无法启动：打包白名单遗漏 `src/main/`，导致 `Cannot find module './src/main/profiles'`；现已包含该目录

### 新增

- 全界面中文化：连接、日志、网络诊断、进程监控、安装页、启动页、托盘与系统提示
- 托盘快速连接：直接使用已保存配置发起连接，支持从托盘断开
- 开机自动启动（仅打包版，托盘菜单中开关）；登录后后台驻留托盘，不弹启动页
- 连接状态显示、系统通知与错误弹窗（主窗口隐藏时也能收到反馈）
- 退出确认：VPN 连接中退出会先确认
- 独立应用图标与 appId（`com.hkproto1.openconnectgui`）

### 安全

- 配置密码改用 macOS 钥匙串（`safeStorage`）加密存储，旧版明文 `profiles.json` 首次加载时自动迁移为 v2 加密格式
- 修复凭据泄漏：sudo 密码与 VPN 密码不再出现在进程命令行中（`ps aux` 不可见），改为 0600 临时文件并在读取后立即删除
- 配置文件权限收紧为 `0600`，写入采用原子替换

### 工程

- 版本号单一来源（`app.getVersion()`），页脚与启动页自动同步
- 网络路由/接口解析抽离为纯函数模块，新增 `node:test` 单测
- 新增 GitHub Actions CI（macOS runner：测试 + 前端构建）
- 打包输出改到 `release/`，不再与 Vite 的 `dist` 冲突

### 安装（Apple Silicon）

1. 下载 `OpenConnect VPN-1.1.1-arm64.dmg`
2. 将应用拖入 `/Applications`
3. 本包未签名，首次启动需清除隔离标记：

```bash
xattr -cr "/Applications/OpenConnect VPN.app"
open "/Applications/OpenConnect VPN.app"
```

4. 依赖本机已安装 OpenConnect：`brew install openconnect`
5. 「开机自动启动」需要应用保持固定在 `/Applications`；移动应用后需重新勾选
6. 首次进入主界面会把 `profiles.json` 迁移为加密格式，迁移后旧版应用将无法读取该文件

### 已知限制

- 仅提供 arm64 构建
- 未签名/未公证，首次启动需手动清除 quarantine
- 密码以钥匙串加密保存；换机或重装系统后需重新输入密码

---

# OpenConnect VPN GUI v1.0.0（上游版本）

Native macOS application for managing OpenConnect VPN connections with advanced network diagnostics and process monitoring.

## ✨ Features

### Core VPN Management
- 🔐 Secure VPN connections with interactive authentication
- 💾 Profile management - Save and load multiple VPN profiles with credentials
- 🌐 Real-time public IP address monitoring
- 🔔 System tray integration for quick access

### Advanced Features
- 🧭 **Multi-Tab Interface** - Organized navigation (Connection, Logs, Diagnostics, Processes)
- 🔍 **Network Diagnostics** - Detect and fix problematic routes that block VPN connections
- 📊 **Process Monitor** - View and kill running OpenConnect processes with sudo authentication
- 📝 **Comprehensive Logging** - Real-time connection logs with extensive debugging
- ⚡ **Lazy Loading** - Diagnostics load only when needed for better performance

### User Experience
- 🎨 Modern UI built with shadcn/ui and Tailwind CSS
- 🌓 Dark mode support
- ℹ️ Contextual help in all tabs
- 📌 Version display in footer

## 📦 Installation

### 1. Download
Download `OpenConnect-VPN-1.0.0-arm64.dmg` below (for Apple Silicon Macs: M1/M2/M3)

### 2. Install
1. Open the DMG file
2. Drag "OpenConnect VPN" to Applications folder

### 3. ⚠️ Important: First Launch

macOS will show **"OpenConnect VPN is damaged"** because the app is **not code-signed**.

**Choose one method to bypass the warning:**

**Method 1: Terminal (Recommended)**
```bash
xattr -cr "/Applications/OpenConnect VPN.app"
```
Then launch the app normally.

**Method 2: Right-Click**
1. Right-click on "OpenConnect VPN" in Applications
2. Click "Open"
3. Click "Open" again in the security dialog

**You only need to do this once.** Subsequent launches will work normally.

## ⚙️ Requirements

- **macOS**: 10.13 or later
- **Architecture**: Apple Silicon (M1/M2/M3)
- **OpenConnect**: Install with `brew install openconnect`
- **expect**: Pre-installed on macOS

## 🔒 Security

- ✅ Input validation and command injection prevention
- ✅ Sudo-authenticated privileged operations
- ✅ Context isolation for renderer process
- ✅ Safe command execution using spawn with argument arrays
- ⚠️ Passwords stored in plaintext JSON locally (consider using macOS Keychain)

## 📸 Screenshots

See [README](https://github.com/jadedm/openconnect-gui#screenshots) for screenshots and full documentation.

## 🐛 Known Issues

- App is unsigned (requires manual security bypass on first launch)
- Intel Mac build not included in this release
- Password storage uses plaintext JSON (macOS Keychain integration planned)

## 📝 Full Changelog

### Added
- Multi-tab navigation interface
- Network diagnostics panel with route detection
- Automatic problematic route identification
- Sudo-authenticated route deletion from UI
- Process monitoring and management
- Process killing with sudo authentication
- Recent activity panel (last 10 logs)
- Lazy loading for diagnostics tab
- Comprehensive error handling and logging
- Security hardening with input validation
- Dark mode support throughout
- Contextual help sections
- Footer with version number
- Screenshots in documentation

### Security
- Command injection prevention for PID, routes, and connectivity tests
- Input validation for all system commands
- Safe command execution patterns

---

**Support**: Report issues at https://github.com/jadedm/openconnect-gui/issues

**License**: MIT
