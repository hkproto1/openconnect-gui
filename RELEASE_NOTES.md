# OpenConnect VPN GUI（hkproto1 fork）

## v1.3.0

> 重点修复：连接失败时不再笼统提示「可能是管理员密码错误」，日志会直接给出路由/网络/认证层面的具体结论。

### 修复

- 连接失败诊断重构：不再对所有退出码统一提示「可能是 sudo 密码错误或网络问题」，而是根据 OpenConnect 输出、TCP 探测结果与当前路由表判断具体原因：
  - sudo 密码错误 / VPN 用户名密码错误分别提示
  - `Can't assign requested address` 明确指向本机路由异常，并列出服务器当前路由与默认网关
  - `Connection refused`、连接超时、TCP 无法建立、TLS/证书握手失败分别给出对应建议
  - 连接结束后会自动复查残留路由，即使原因为其他类型也会单独提示
- 修复 expect 的认证错误标记只在 stderr 检查的问题（实际 puts 与 OpenConnect 输出走 stdout），认证失败现在一定能被识别

### 新增

- 连接流程日志更完整：
  - 输出服务器解析结果、本机 IPv4 地址、默认网关、服务器当前主机路由与 flags
  - 残留路由检测/删除的每一步都有独立日志，包含旧网关与网卡名
  - 连接前自动测试服务器 TCP 端口，不可达时先给出警告
  - 连接成功记录耗时，进程退出记录退出码与持续时长
- 主界面新增「关于」：
  - 查看当前版本
  - 检查更新、查看更新说明
  - 一键下载并打开更新 dmg
  - GitHub 仓库、问题反馈、上游项目与许可证信息

### 优化

- 日志面板重新设计：
  - 逐行展示，按级别着色（错误 / 警告 / 成功 / 步骤 / 路由 / 网络 / 诊断 / 建议 / 调试）
  - 支持「全部 / 错误 / 警告 / 流程」筛选，显示条数与错误数
  - 复制成功反馈、清空、自动滚动与「回到底部」
  - 最近活动卡片同步按级别着色并显示错误数量
- 连接表单密码提示更正为「使用 macOS 钥匙串加密」

### 安全

- expect 发送 sudo / VPN 密码时临时关闭 `log_user`，避免密码被 PTY 回显到日志

### 工程

- 路由模块新增 `inspectServerRoute`，统一输出服务器 IP、本机地址、默认路由、当前主机路由与残留路由
- 单元测试增至 20 条

### 安装（Apple Silicon）

1. 下载 `OpenConnect VPN-1.3.0-arm64.dmg`
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

# 上游版本 v1.0.0（jadedm/openconnect-gui）

macOS 原生 OpenConnect VPN 图形客户端，支持网络诊断与进程监控。

## 功能

### 核心 VPN 管理

- 安全 VPN 连接，支持交互式认证
- 配置管理：保存并加载多个带凭据的 VPN 配置
- 实时公网 IP 监控
- 系统托盘集成，菜单栏快速访问

### 高级功能

- **多标签界面**：连接、日志、诊断、进程分区导航
- **网络诊断**：检测并修复阻塞 VPN 连接的问题路由
- **进程监控**：通过 sudo 认证查看并结束运行中的 OpenConnect 进程
- **完整日志**：实时连接日志与详细调试信息
- **懒加载**：诊断页按需加载，减少开销

### 使用体验

- 基于 shadcn/ui 与 Tailwind CSS 的现代界面
- 深色模式
- 各标签页内置上下文帮助
- 页脚显示版本号

## 安装

下载 `OpenConnect-VPN-1.0.0-arm64.dmg`（适用于 Apple Silicon：M1/M2/M3），打开后将「OpenConnect VPN」拖入「应用程序」。

应用未签名，首次启动会被提示「已损坏」，可任选一种方式处理：

**方式一：终端（推荐）**

```bash
xattr -cr "/Applications/OpenConnect VPN.app"
```

**方式二：右键打开**

1. 在「应用程序」中右键（或 Control + 点击）应用
2. 选择「打开」
3. 在安全提示中再次点击「打开」

只需处理一次，后续启动正常。

## 环境要求

- macOS 10.13 或更高
- Apple Silicon（M1/M2/M3）
- OpenConnect：`brew install openconnect`
- expect：macOS 自带

## 安全

- 输入校验与命令注入防护
- 通过 sudo 认证执行特权操作
- 渲染进程上下文隔离
- 使用 `spawn` + 参数数组执行命令
- 注意：上游版本将密码以明文 JSON 保存在本地（本 fork 已改为钥匙串加密）

## 截图

见上游 [README](https://github.com/jadedm/openconnect-gui#screenshots)。

## 已知问题

- 应用未签名，首次启动需手动绕过安全提示
- 该版本未提供 Intel 构建
- 密码以明文 JSON 存储（当时计划接入 macOS 钥匙串）

## 变更记录

### 新增

- 多标签导航界面
- 网络诊断面板与路由检测
- 自动识别问题路由
- 在界面中通过 sudo 删除路由
- 进程监控与管理
- 通过 sudo 结束进程
- 最近活动面板（最近 10 条日志）
- 诊断页懒加载
- 完整的错误处理与日志
- 输入校验安全加固
- 全局深色模式
- 上下文帮助
- 页脚版本号
- 文档截图

### 安全

- 针对 PID、路由、连通性测试的命令注入防护
- 所有系统命令输入校验
- 安全的命令执行方式

---

**问题反馈**：https://github.com/jadedm/openconnect-gui/issues

**许可证**：MIT
