const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell, nativeImage, Notification } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const profileStore = require('./src/main/profiles');
const parsers = require('./src/main/parsers');
const routes = require('./src/main/routes');
const netstats = require('./src/main/netstats');
const speedtest = require('./src/main/speedtest');
const updater = require('./src/main/updater');

let mainWindow;
let splashWindow;
let installerWindow;
let tray;
let openconnectProcess = null;
let connectionStatus = 'disconnected';
const PROFILES_FILE = path.join(app.getPath('userData'), 'profiles.json');
let systemChecksComplete = false;

// Create splash window
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 700,
    frame: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  // Load the splash screen - in dev mode, load from vite server; in production, load from dist
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    splashWindow.loadURL('http://localhost:5173/pages/splash.html');
  } else {
    splashWindow.loadFile(path.join(__dirname, 'dist', 'pages', 'splash.html'));
  }

  splashWindow.center();

  // Handle splash window events
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// Perform system checks
async function performSystemChecks() {
  let progress = 0;
  const totalChecks = 6;
  const updateProgress = () => {
    progress++;
    const percent = Math.round((progress / totalChecks) * 100);
    if (splashWindow) {
      splashWindow.webContents.send('splash-progress', percent);
    }
  };

  try {
    // Check 1: Electron runtime
    if (splashWindow) {
      splashWindow.webContents.send('system-check-start', '应用运行时');
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    if (splashWindow) {
      splashWindow.webContents.send('system-check-complete', '应用运行时', true, `Electron v${process.versions.electron}`);
    }
    updateProgress();

    // Check 2: File system access
    if (splashWindow) {
      splashWindow.webContents.send('system-check-start', '文件系统访问');
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    try {
      const userDataPath = app.getPath('userData');
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      if (splashWindow) {
        splashWindow.webContents.send('system-check-complete', '文件系统访问', true, '正常');
      }
    } catch (error) {
      if (splashWindow) {
        splashWindow.webContents.send('system-check-complete', '文件系统访问', false, error.message);
      }
    }
    updateProgress();

    // Check 3: OpenConnect installation
    if (splashWindow) {
      splashWindow.webContents.send('system-check-start', 'OpenConnect 可执行文件');
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    const openconnectCheck = await checkOpenConnect();
    if (openconnectCheck.installed) {
      if (splashWindow) {
        splashWindow.webContents.send('system-check-complete', 'OpenConnect 可执行文件', true, openconnectCheck.path || '已找到');
      }
    } else {
      if (splashWindow) {
        splashWindow.webContents.send('system-check-complete', 'OpenConnect 可执行文件', false, '未安装');
        splashWindow.webContents.send('splash-error', {
          message: '未检测到 OpenConnect，请执行：brew install openconnect',
          action: 'install-openconnect'
        });
      }
      // Don't continue if OpenConnect is not found
      updateProgress();
      updateProgress();
      updateProgress();
      updateProgress();
      return false;
    }
    updateProgress();

    // Check 4: Expect binary
    if (splashWindow) {
      splashWindow.webContents.send('system-check-start', 'Expect 可执行文件');
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    const expectCheck = await checkExpect();
    if (expectCheck.installed) {
      if (splashWindow) {
        splashWindow.webContents.send('system-check-complete', 'Expect 可执行文件', true, expectCheck.path || '已找到');
      }
    } else {
      if (splashWindow) {
        splashWindow.webContents.send('system-check-complete', 'Expect 可执行文件', false, '未安装');
        splashWindow.webContents.send('splash-error', {
          message: '未检测到 Expect。macOS 一般自带该工具，可尝试：brew install expect',
          action: null
        });
      }
      updateProgress();
      updateProgress();
      return false;
    }
    updateProgress();

    // Check 5: Network capabilities
    if (splashWindow) {
      splashWindow.webContents.send('system-check-start', '网络能力');
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    if (splashWindow) {
      splashWindow.webContents.send('system-check-complete', '网络能力', true, '可用');
    }
    updateProgress();

    // Check 6: Sudo privileges
    if (splashWindow) {
      splashWindow.webContents.send('system-check-start', 'sudo 权限');
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    const sudoCheck = await checkSudoAccess();
    if (sudoCheck.available) {
      if (splashWindow) {
        splashWindow.webContents.send('system-check-complete', 'sudo 权限', true, '当前用户具有 sudo 权限');
      }
    } else {
      if (splashWindow) {
        splashWindow.webContents.send('system-check-warning', 'sudo 权限', '连接时需要 sudo 权限，届时会弹窗输入密码');
      }
    }
    updateProgress();

    // All checks passed
    if (splashWindow) {
      splashWindow.webContents.send('splash-complete');
    }
    systemChecksComplete = true;
    return true;

  } catch (error) {
    console.error('System check error:', error);
    if (splashWindow) {
      splashWindow.webContents.send('splash-error', {
        message: `系统检查失败：${error.message}`
      });
    }
    return false;
  }
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false, // Don't show immediately
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 }
  });

  // Load the app - in dev mode, load from vite server; in production, load from dist
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // Development mode - load from Vite dev server
    mainWindow.loadURL('http://localhost:5173/pages/index.html');
    // Open DevTools in development
    // mainWindow.webContents.openDevTools();
  } else {
    // Production mode - load from built files
    mainWindow.loadFile(path.join(__dirname, 'dist', 'pages', 'index.html'));
  }

  // Prevent window close, minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Create installer helper window
function createInstallerWindow() {
  if (installerWindow) {
    installerWindow.focus();
    return;
  }

  installerWindow = new BrowserWindow({
    width: 700,
    height: 650,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true
  });

  // Load the installer helper - in dev mode, load from vite server; in production, load from dist
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    installerWindow.loadURL('http://localhost:5173/pages/installer-helper.html');
  } else {
    installerWindow.loadFile(path.join(__dirname, 'dist', 'pages', 'installer-helper.html'));
  }

  installerWindow.on('closed', () => {
    installerWindow = null;
  });
}

// This function is no longer needed - checks are done in splash screen

// Helper function to check OpenConnect
function checkOpenConnect() {
  return new Promise((resolve) => {
    // Check for OpenConnect in multiple locations
    const locations = [
      '/usr/local/bin/openconnect',           // Homebrew (Intel Mac)
      '/opt/homebrew/bin/openconnect',        // Homebrew (Apple Silicon)
      path.join(process.env.HOME, '.local/openconnect/bin/openconnect'), // Standalone install
      path.join(__dirname, 'bin', 'openconnect'), // Bundled with app (dev)
      path.join(process.resourcesPath, 'bin', 'openconnect'), // Bundled with app (production)
    ];

    // Check each location
    for (const location of locations) {
      if (fs.existsSync(location)) {
        resolve({ installed: true, path: location });
        return;
      }
    }

    // Fallback to 'which' command
    const checkProcess = spawn('which', ['openconnect']);
    checkProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ installed: true, path: 'openconnect' });
      } else {
        resolve({ installed: false });
      }
    });
  });
}

// Check if expect is installed
function checkExpect() {
  return new Promise((resolve) => {
    // Check for expect in common locations
    const locations = [
      '/usr/bin/expect',           // Standard macOS location
      '/opt/homebrew/bin/expect',  // Homebrew (Apple Silicon)
      '/usr/local/bin/expect',     // Homebrew (Intel Mac)
    ];

    // Check each location
    for (const location of locations) {
      if (fs.existsSync(location)) {
        resolve({ installed: true, path: location });
        return;
      }
    }

    // Fallback to 'which' command
    const checkProcess = spawn('which', ['expect']);
    checkProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ installed: true, path: 'expect' });
      } else {
        resolve({ installed: false });
      }
    });
  });
}

// Check if user has sudo access
function checkSudoAccess() {
  return new Promise((resolve) => {
    // Check if user is in admin/sudo group
    // Note: This doesn't guarantee they know the password, just that they have potential access
    const checkProcess = spawn('groups');
    let output = '';

    checkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    checkProcess.on('close', () => {
      // Check if user is in admin or wheel group (common sudo groups on macOS)
      const hasAdminAccess = output.includes('admin') || output.includes('wheel');
      resolve({ available: hasAdminAccess });
    });
  });
}

// Get the OpenConnect binary path
function getOpenConnectPath() {
  return new Promise((resolve) => {
    checkOpenConnect().then(result => {
      resolve(result.path || 'openconnect');
    });
  });
}

// Get the vpnc-script path
function getVpncScriptPath() {
  const locations = [
    '/opt/homebrew/etc/vpnc/vpnc-script',           // Homebrew (Apple Silicon)
    '/usr/local/etc/vpnc/vpnc-script',              // Homebrew (Intel)
    '/opt/homebrew/opt/vpnc-scripts/etc/vpnc/vpnc-script', // Homebrew alternate
    '/usr/local/opt/vpnc-scripts/etc/vpnc/vpnc-script',    // Homebrew alternate
    path.join(process.env.HOME, '.local/openconnect/etc/vpnc/vpnc-script'), // Standalone
  ];

  // Check each location
  for (const location of locations) {
    if (fs.existsSync(location)) {
      return location;
    }
  }

  // Fallback to just 'vpnc-script' and hope it's in PATH
  return 'vpnc-script';
}

// Create system tray
function createTray() {
  // macOS 菜单栏图标优先使用模板图像，自动适配浅色/深色模式
  const templatePath = path.join(__dirname, 'assets', 'tray-iconTemplate.png');
  const templateImage = nativeImage.createFromPath(templatePath);

  if (templateImage.isEmpty()) {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
  } else {
    templateImage.setTemplateImage(true);
    tray = new Tray(templateImage);
  }

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
}

const statusLabels = {
  disconnected: '未连接',
  connecting: '连接中',
  connected: '已连接'
};

// 托盘“快速连接”可用的已保存配置
function getTrayProfiles() {
  const result = profileStore.loadProfiles(PROFILES_FILE);
  if (!result.success) {
    return [];
  }
  return result.profiles.filter((profile) => profile.server && profile.username);
}

// 直接从托盘用已保存配置发起连接
async function connectFromTray(profile) {
  const result = await startConnection({
    server: profile.server,
    username: profile.username,
    password: profile.password || '',
    authgroup: profile.authgroup || undefined,
    protocol: profile.protocol || 'anyconnect',
    serverCert: profile.serverCert || undefined
  });

  if (!result.success) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'OpenConnect VPN',
      message: result.error || '连接失败',
      buttons: ['确定']
    });
  }
}

function updateTrayMenu() {
  // Only update tray if it exists
  if (!tray) {
    return;
  }

  const statusText = statusLabels[connectionStatus] || connectionStatus;

  // Login item can only be registered by a packaged .app bundle
  const canToggleLoginItem = app.isPackaged;
  const loginItemEnabled = canToggleLoginItem && app.getLoginItemSettings().openAtLogin;

  const trayProfiles = getTrayProfiles();
  const quickConnectItems = trayProfiles.length > 0
    ? trayProfiles.map((profile) => ({
        label: profile.name || profile.server,
        click: () => connectFromTray(profile)
      }))
    : [{ label: '暂无已保存的配置', enabled: false }];

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `状态：${statusText}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      }
    },
    {
      label: '快速连接',
      enabled: connectionStatus === 'disconnected',
      submenu: quickConnectItems
    },
    {
      label: '断开连接',
      enabled: connectionStatus !== 'disconnected',
      click: () => {
        const result = disconnectVPN();
        if (!result.success) {
          dialog.showMessageBox({
            type: 'warning',
            title: 'OpenConnect VPN',
            message: result.error || '断开连接失败',
            buttons: ['确定']
          });
        }
      }
    },
    {
      label: canToggleLoginItem ? '开机自动启动' : '开机自动启动（打包版可用）',
      type: 'checkbox',
      checked: loginItemEnabled,
      enabled: canToggleLoginItem,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
        updateTrayMenu();
      }
    },
    {
      label: '检查更新',
      click: () => checkForUpdatesManually()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: async () => {
        if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
          const { response } = await dialog.showMessageBox({
            type: 'warning',
            title: 'OpenConnect VPN',
            message: 'VPN 处于连接状态',
            detail: '退出应用会断开当前连接，是否继续？',
            buttons: ['取消', '退出'],
            defaultId: 0,
            cancelId: 0
          });
          if (response !== 1) {
            return;
          }
        }
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`OpenConnect VPN - ${statusText}`);
}

let updateCheckInProgress = false;
let updateDownloadInProgress = false;
let updateNotification = null;

// 连接前检查上一网络环境遗留的主机路由（例如旧网段网关仍指向服务器 IP），
// 否则系统会报 "Can't assign requested address" 导致连接失败。
// 每一步都会写入日志，便于用户直接看出失败原因。
async function prepareServerRoute(serverUrl, sudoPassword) {
  sendLog('[步骤] 检查服务器地址与残留主机路由', 'step');

  let info;
  try {
    info = await routes.inspectServerRoute(serverUrl);
  } catch (error) {
    sendLog(`[警告] 读取路由表失败：${error.message}`, 'warn');
    sendLog('[提示] 跳过残留路由检查，继续尝试连接', 'warn');
    return true;
  }

  if (!info.resolved) {
    sendLog(`[警告] 无法解析服务器地址「${info.host || serverUrl}」，跳过残留路由检查`, 'warn');
    return true;
  }

  sendLog(`[网络] 服务器 ${info.host} → ${info.ip}`, 'info');
  sendLog(
    info.addresses.length
      ? `[网络] 本机 IPv4 地址：${info.addresses.join('、')}`
      : '[网络] 未检测到本机 IPv4 地址',
    'info'
  );

  if (info.defaultRoute) {
    sendLog(`[路由] 默认网关：${info.defaultRoute.gateway}（${info.defaultRoute.interface}）`, 'route');
  }

  if (info.existingRoute) {
    const flags = info.existingRoute.flags ? `，flags ${info.existingRoute.flags}` : '';
    sendLog(
      `[路由] 服务器当前主机路由：${info.existingRoute.gateway}（${info.existingRoute.interface}${flags}）`,
      'route'
    );
  } else {
    sendLog('[路由] 未发现服务器主机路由，将按默认网关选路', 'info');
  }

  if (!info.staleRoute) {
    sendLog('[路由] 未发现旧网络遗留的残留路由', 'success');
    return true;
  }

  sendLog(
    `[警告] 检测到残留主机路由：${info.ip} → ${info.staleRoute.gateway}（${info.staleRoute.interface}），该网关不属于当前网段`,
    'warn'
  );
  sendLog('[路由] 正在删除残留路由…', 'step');

  let result;
  try {
    result = await routes.deleteHostRoute(info.ip, sudoPassword);
  } catch (error) {
    sendLog(`[错误] 删除残留路由失败：${error.message}`, 'error');
    return true;
  }

  if (result.success) {
    sendLog(`[成功] 已删除残留路由 ${info.ip}，将按当前网络重新选路`, 'success');
    const after = await routes.inspectServerRoute(serverUrl).catch(() => null);
    if (after && after.staleRoute) {
      sendLog('[警告] 删除后仍检测到残留路由，连接可能继续受影响', 'warn');
    }
    return true;
  }

  if (result.incorrectPassword) {
    sendLog('[错误] sudo 密码错误，无法清理残留路由，已停止连接', 'error');
    return false;
  }

  sendLog(`[错误] 残留路由删除失败：${result.error || '未知错误'}`, 'error');
  sendLog('[建议] 请打开「网络诊断」页手动删除该路由，或确认 sudo 权限后重试', 'warn');
  return true;
}

function parseServerEndpoint(serverUrl) {
  const host = routes.extractHost(serverUrl);
  let port = 443;
  try {
    const normalized = /^https?:\/\//.test(serverUrl) ? serverUrl : `https://${serverUrl}`;
    const url = new URL(normalized);
    if (url.port) {
      port = parseInt(url.port, 10);
    } else if (url.protocol === 'http:') {
      port = 80;
    }
  } catch {
    // 地址不合法时保持默认端口，后续连接阶段会给出具体错误
  }
  return { host, port };
}

// 连接前用 nc 探测服务器 TCP 端口，提前暴露网络/路由问题
function testTcpConnectivity(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const child = spawn('nc', ['-zv', '-G', '5', host, String(port)], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    child.on('close', (code) => {
      const success = code === 0 && /succeeded|open/i.test(output);
      finish({
        success,
        code,
        message: output.trim() || `退出码 ${code}`
      });
    });
    child.on('error', (error) => {
      finish({ success: false, message: error.message });
    });

    timer = setTimeout(() => {
      if (!child.killed) {
        child.kill();
      }
      finish({ success: false, message: '连接超时' });
    }, timeout);
  });
}

// 判定 OpenConnect 单行输出的日志级别
function classifyOutputLine(line) {
  if (line.includes('[EXPECT ERROR]')) return 'error';
  if (/CONNECTED|Established|Configured as/.test(line)) return 'success';
  if (/WARNING|Warning|warning/i.test(line)) return 'warn';
  if (/error|failed|failure|denied|refused|unreachable|no route|cannot|can't|timed out|incorrect|invalid/i.test(line)) {
    return 'error';
  }
  return 'info';
}

// 将 OpenConnect 的多行输出拆成逐行日志，避免一大段文本难以阅读
function logProcessOutput(output) {
  for (const rawLine of String(output).split('\n')) {
    const line = rawLine.replace(/\r$/, '').trimEnd();
    if (!line.trim()) continue;
    sendLog(line, classifyOutputLine(line));
  }
}

// 连接失败后根据输出、探测结果与当前路由表给出可执行的诊断结论
async function buildFailureDiagnosis({ exitCode, output, probe, serverUrl, sudoAuthError, vpnAuthError }) {
  const text = [String(output || ''), probe?.message || ''].filter(Boolean).join('\n');
  const endpoint = parseServerEndpoint(serverUrl);
  const entries = [];
  const push = (type, message) => entries.push({ type, message });

  let routeInfo = null;
  try {
    routeInfo = await routes.inspectServerRoute(serverUrl);
  } catch {
    // 路由表读取失败时不影响其他诊断
  }

  const assignAddress = /Can't assign requested address/i.test(text);
  const refused = /Connection refused/i.test(text);
  const timedOut = /timed out|Operation timed out|Connection timed out/i.test(text);
  const connectionFailed = /Failed to connect|Failed to open|connection failed/i.test(text);
  const tlsFailure = /TLS handshake failed|SSL error|certificate verify failed|servercert.*(invalid|mismatch)|certificate.*(invalid|expired|not trusted)/i.test(text);

  push('error', `[诊断] OpenConnect 进程已退出，退出码 ${exitCode}`);

  if (probe && !probe.success) {
    push('warn', `[网络] 连接前 TCP 探测失败：${probe.message}`);
  }

  let headline = '连接失败，请查看日志中的诊断信息';

  if (sudoAuthError) {
    headline = 'sudo 密码错误，连接未建立';
    push('error', '[原因] sudo 密码错误，OpenConnect 无法获得管理员权限');
    push('warn', '[建议] 重新输入 macOS 管理员密码后重试');
  } else if (vpnAuthError) {
    headline = 'VPN 认证失败，请检查用户名或密码';
    push('error', '[原因] VPN 认证失败：用户名或密码不正确，或认证组、协议不匹配');
    push('warn', '[建议] 检查用户名、密码、认证组与协议设置');
  } else if (assignAddress) {
    headline = '连接失败：本机路由异常，无法为服务器分配出口';
    push('error', '[原因] 系统无法为服务器分配有效出口（Can\'t assign requested address）');
    if (routeInfo && routeInfo.staleRoute) {
      push('error', `[诊断] 检测到残留主机路由：${routeInfo.ip} → ${routeInfo.staleRoute.gateway}（${routeInfo.staleRoute.interface}）`);
      push('warn', `[建议] 打开「网络诊断」页删除 ${routeInfo.ip} 的主机路由，或执行 sudo route delete ${routeInfo.ip}`);
    } else {
      push('warn', '[建议] 打开「网络诊断」页检查服务器 IP 的路由，必要时重启网络接口后重试');
    }
  } else if (refused) {
    headline = '连接失败：服务器拒绝连接';
    push('error', `[原因] ${endpoint.host}:${endpoint.port} 拒绝连接，端口未开放或被防火墙拦截`);
    push('warn', '[建议] 确认服务器地址与端口是否正确，或更换网络后重试');
  } else if (timedOut) {
    headline = '连接失败：连接超时';
    if (routeInfo && routeInfo.staleRoute) {
      push('error', `[诊断] 检测到残留主机路由：${routeInfo.ip} → ${routeInfo.staleRoute.gateway}（${routeInfo.staleRoute.interface}）`);
      push('error', '[原因] 超时可能由旧网络遗留的路由导致，当前网络无法通过该网关访问服务器');
      push('warn', `[建议] 打开「网络诊断」页删除 ${routeInfo.ip} 的主机路由后重试`);
    } else {
      push('error', `[原因] 连接 ${endpoint.host}:${endpoint.port} 超时，可能是网络不可达、防火墙或路由问题`);
      push('warn', '[建议] 检查本机网络与服务器状态，或打开「网络诊断」页测试连通性');
    }
  } else if (connectionFailed) {
    headline = '连接失败：无法与服务器建立 TCP 连接';
    push('error', `[原因] 无法连接 ${endpoint.host}:${endpoint.port}，可能是网络不可达、服务器未开放或被防火墙拦截`);
    if (routeInfo && routeInfo.staleRoute) {
      push('error', `[诊断] 检测到残留主机路由：${routeInfo.ip} → ${routeInfo.staleRoute.gateway}（${routeInfo.staleRoute.interface}）`);
      push('warn', `[建议] 打开「网络诊断」页删除 ${routeInfo.ip} 的主机路由后重试`);
    } else {
      push('warn', '[建议] 打开「网络诊断」页测试服务器连通性，或更换网络后重试');
    }
  } else if (tlsFailure) {
    headline = '连接失败：TLS/证书握手失败';
    push('error', '[原因] TLS 或证书握手失败，可能是服务器证书指纹不匹配或被代理拦截');
    push('warn', '[建议] 检查「服务器证书」指纹是否正确，或临时清空该字段重试');
  } else {
    push('error', '[原因] 连接未能建立，日志中没有明确的认证失败信息');
    push('warn', '[建议] 展开日志查看 OpenConnect 原始输出；若出现 Can\'t assign requested address，请到「网络诊断」页清理残留路由');
  }

  // 无论何种原因，只要当前仍有残留路由，都单独提示
  if (routeInfo && routeInfo.staleRoute && !assignAddress && !timedOut && !connectionFailed) {
    push('error', `[诊断] 复查发现残留主机路由：${routeInfo.ip} → ${routeInfo.staleRoute.gateway}（${routeInfo.staleRoute.interface}），建议一并清理`);
    push('warn', `[建议] 打开「网络诊断」页删除 ${routeInfo.ip} 的主机路由后重试`);
  }

  if (routeInfo && routeInfo.ip) {
    const current = routeInfo.existingRoute
      ? `${routeInfo.existingRoute.gateway}（${routeInfo.existingRoute.interface}）`
      : '无主机路由，将使用默认网关';
    push('info', `[路由] 服务器 ${routeInfo.ip} 当前路由：${current}`);
    if (routeInfo.defaultRoute) {
      push('info', `[路由] 默认网关：${routeInfo.defaultRoute.gateway}（${routeInfo.defaultRoute.interface}）`);
    }
  }

  return { entries, headline };
}

let speedTestInProgress = false;

function execOutput(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      resolve(stdout);
    });
  });
}

// 读取各接口累计字节数与当前 VPN/物理接口，渲染层按 1 秒间隔计算速率
async function readNetworkStats() {
  const [netstatOut, routeOut, ifconfigOut] = await Promise.all([
    execOutput('netstat -ib'),
    execOutput('netstat -rn'),
    execOutput('ifconfig')
  ]);

  const counters = netstats.parseInterfaceCounters(netstatOut);
  const routeTable = parsers.parseRoutes(routeOut);
  const interfaces = parsers.parseNetworkInterfaces(ifconfigOut);
  const defaultRoute = routes.findDefaultRoute(routeTable);
  const vpnInterface = netstats.selectVpnInterface(interfaces, routeTable, counters);
  const primaryInterface = defaultRoute ? defaultRoute.interface : null;
  const ipMap = new Map(interfaces.map((item) => [item.name, item.ip]));

  return {
    success: true,
    timestamp: Date.now(),
    connectionStatus,
    vpnInterface,
    primaryInterface,
    defaultRoute: defaultRoute
      ? { gateway: defaultRoute.gateway, interface: defaultRoute.interface }
      : null,
    route: netstats.describeRoute({ connectionStatus, vpnInterface, defaultRoute }),
    interfaces: counters.map((counter) => ({
      name: counter.name,
      ip: ipMap.get(counter.name) || null,
      ibytes: counter.ibytes,
      obytes: counter.obytes,
      isVpn: counter.name === vpnInterface,
      isPrimary: counter.name === primaryInterface
    }))
  };
}

async function runSpeedTest(progress) {
  const snapshot = await readNetworkStats();
  const route = netstats.describeRoute({
    connectionStatus: snapshot.connectionStatus,
    vpnInterface: snapshot.vpnInterface,
    defaultRoute: snapshot.defaultRoute
  });

  progress({ phase: 'latency', message: '正在测试国际节点延迟…' });
  let latencyMs = null;
  try {
    const latency = await speedtest.measureLatency();
    latencyMs = latency.latencyMs;
  } catch {
    latencyMs = null;
  }

  progress({ phase: 'download', received: 0, total: speedtest.SPEED_TEST_DOWNLOAD_BYTES });
  const download = await speedtest.measureDownloadSpeed(speedtest.SPEED_TEST_DOWNLOAD_BYTES, progress);

  let upload = null;
  let uploadError = null;
  progress({ phase: 'upload', sent: 0, total: speedtest.SPEED_TEST_UPLOAD_BYTES });
  try {
    upload = await speedtest.measureUploadSpeed(speedtest.SPEED_TEST_UPLOAD_BYTES);
    progress({ phase: 'upload', sent: speedtest.SPEED_TEST_UPLOAD_BYTES, total: speedtest.SPEED_TEST_UPLOAD_BYTES });
  } catch (error) {
    uploadError = error.message;
  }

  const downloadMbps = download.seconds > 0
    ? (download.bytes * 8) / download.seconds / 1e6
    : null;
  const uploadMbps = upload && upload.seconds > 0
    ? (upload.bytes * 8) / upload.seconds / 1e6
    : null;

  return {
    success: true,
    mode: route.mode,
    routeLabel: route.label,
    routeInterface: route.interface,
    vpnInterface: snapshot.vpnInterface,
    latencyMs,
    downloadMbps,
    uploadMbps,
    downloadBytes: download.bytes,
    uploadBytes: upload ? upload.bytes : 0,
    downloadPartial: download.partial,
    uploadError,
    timestamp: Date.now()
  };
}

async function promptUpdate(result) {
  const detailLines = [
    `当前版本：v${result.currentVersion}`,
    `最新版本：v${result.latestVersion}`
  ];
  const notes = String(result.notes || '').trim();
  if (notes) {
    const trimmed = notes.length > 800 ? `${notes.slice(0, 800)}…` : notes;
    detailLines.push('', '更新说明：', trimmed);
  }

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '发现新版本',
    message: `发现新版本 v${result.latestVersion}`,
    detail: detailLines.join('\n'),
    buttons: ['稍后', '下载更新'],
    defaultId: 1,
    cancelId: 0
  });

  if (response !== 1) {
    return;
  }

  await downloadUpdate(result);
}

async function downloadUpdate(result) {
  if (!result.downloadUrl) {
    shell.openExternal(result.releaseUrl);
    return;
  }

  const fileName = result.downloadName || `OpenConnect VPN-${result.latestVersion}-arm64.dmg`;
  const targetPath = path.join(app.getPath('downloads'), fileName);

  if (Notification.isSupported()) {
    new Notification({
      title: '正在下载更新',
      body: `v${result.latestVersion} 下载完成后会自动打开`
    }).show();
  }

  try {
    const downloaded = await updater.downloadFile(result.downloadUrl, targetPath);
    const openError = await shell.openPath(downloaded.path);
    if (openError) {
      throw new Error(openError);
    }
    await dialog.showMessageBox({
      type: 'info',
      title: '更新已下载',
      message: `v${result.latestVersion} 安装包已打开`,
      detail: '将 OpenConnect VPN 拖入“应用程序”文件夹覆盖旧版本即可完成更新，随后重启应用。',
      buttons: ['确定']
    });
  } catch (error) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: '下载更新失败',
      message: error.message,
      detail: '可以改为在 GitHub Releases 页面手动下载安装包。',
      buttons: ['取消', '打开发布页'],
      defaultId: 1,
      cancelId: 0
    });
    if (response === 1) {
      shell.openExternal(result.releaseUrl);
    }
  }
}

async function checkForUpdatesManually() {
  if (updateCheckInProgress) {
    dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: '正在检查更新，请稍候…',
      buttons: ['确定']
    });
    return;
  }

  updateCheckInProgress = true;
  try {
    const result = await updater.checkForUpdate(app.getVersion());
    if (!result.updateAvailable) {
      await dialog.showMessageBox({
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本',
        detail: `当前版本：v${result.currentVersion}`,
        buttons: ['确定']
      });
      return;
    }
    await promptUpdate(result);
  } catch (error) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: '检查更新失败',
      message: error.message,
      detail: '请检查网络连接后重试，或打开 GitHub Releases 页面手动查看。',
      buttons: ['取消', '打开发布页'],
      defaultId: 1,
      cancelId: 0
    });
    if (response === 1) {
      shell.openExternal(`https://github.com/${updater.DEFAULT_REPO}/releases`);
    }
  } finally {
    updateCheckInProgress = false;
  }
}

// 启动后静默检查：仅在有新版本时发系统通知，不打断用户
async function checkForUpdatesSilently() {
  if (updateCheckInProgress) {
    return;
  }

  updateCheckInProgress = true;
  try {
    const result = await updater.checkForUpdate(app.getVersion());
    if (!result.updateAvailable) {
      return;
    }
    if (Notification.isSupported()) {
      // 保留引用，避免 Notification 被回收后点击回调失效
      updateNotification = new Notification({
        title: `发现新版本 v${result.latestVersion}`,
        body: '点击查看并下载更新'
      });
      updateNotification.on('click', () => {
        promptUpdate(result).catch(() => {});
      });
      updateNotification.show();
    }
  } catch (error) {
    console.log('自动检查更新失败：', error.message);
  } finally {
    updateCheckInProgress = false;
  }
}

// 启动 VPN 连接。渲染层的 IPC 调用和托盘快速连接共用同一份逻辑。
async function startConnection(config) {
  if (openconnectProcess) {
    return { success: false, error: '已在连接中或已连接' };
  }

  try {
    updateStatus('connecting');

    // Get OpenConnect binary path
    const openconnectPath = await getOpenConnectPath();

    // Get vpnc-script path (optional)
    const vpncScriptPath = getVpncScriptPath();

    // Build openconnect command arguments
    const args = [];

    // Only add vpnc-script if found (to match working manual command)
    if (vpncScriptPath && vpncScriptPath !== 'vpnc-script') {
      args.push('-s', vpncScriptPath);
    }

    // Don't add --user flag - let server prompt for it interactively
    // (Server ignores --user and prompts anyway)

    // Add protocol (default is anyconnect)
    const protocol = config.protocol || 'anyconnect';
    args.push(`--protocol=${protocol}`);

    // Add server (keep https:// if present, add it if not)
    let serverUrl = config.server;
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      serverUrl = `https://${serverUrl}`;
    }
    args.push(`--server=${serverUrl}`);

    // Add server certificate pinning if specified
    if (config.serverCert) {
      args.push('--servercert', config.serverCert);
    }

    if (config.authgroup) {
      args.push(`--authgroup=${config.authgroup}`);
    }

    // Add stability and reconnection options
    args.push('--reconnect-timeout', '60'); // Try to reconnect for 60 seconds
    args.push('--dtls-ciphers', 'DEFAULT'); // Use default DTLS ciphers
    args.push('--verbose'); // More detailed logging

    // Log the command being executed (without password)
    sendLog('[步骤] 准备连接参数', 'step');
    sendLog(`[信息] 服务器：${serverUrl}`, 'info');
    sendLog(`[信息] 协议：${protocol}${config.authgroup ? `，认证组：${config.authgroup}` : ''}`, 'info');
    sendLog(`[信息] OpenConnect：${openconnectPath}`, 'info');
    sendLog(`[调试] 执行命令：sudo openconnect ${args.join(' ')}`, 'debug');

    // Request sudo password from user
    sendLog('[步骤] 请求 macOS 管理员密码', 'step');
    const sudoPassword = await promptForSudoPassword();
    if (!sudoPassword) {
      sendLog('[错误] 用户未提供 sudo 密码', 'error');
      updateStatus('disconnected');
      return { success: false, error: '需要 sudo 密码' };
    }
    sendLog('[调试] 已收到 sudo 密码', 'debug');

    // 连接前清理残留主机路由，避免旧网络环境的路由导致连接失败
    const routeReady = await prepareServerRoute(serverUrl, sudoPassword);
    if (!routeReady) {
      updateStatus('disconnected');
      return { success: false, error: 'sudo 密码错误' };
    }

    // 提前探测服务器端口，让网络/路由问题在日志中直接可见
    const endpoint = parseServerEndpoint(serverUrl);
    sendLog(`[步骤] 测试服务器 TCP 连通性 ${endpoint.host}:${endpoint.port}`, 'step');
    const probe = await testTcpConnectivity(endpoint.host, endpoint.port, 5000);
    if (probe.success) {
      sendLog(`[网络] ${endpoint.host}:${endpoint.port} TCP 可达`, 'success');
    } else {
      sendLog(`[警告] ${endpoint.host}:${endpoint.port} TCP 不可达：${probe.message}`, 'warn');
      sendLog('[提示] 仍会继续尝试建立 VPN；若失败请查看下方诊断结论', 'warn');
    }

    // Use expect script for proper PTY handling
    // In production, it's in extraResources; in dev, it's in project root
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const expectScriptPath = isDev
      ? path.join(__dirname, 'vpn-connect.exp')
      : path.join(process.resourcesPath, 'vpn-connect.exp');

    // Credentials must never be passed on the command line: argv is visible
    // to other processes via `ps`. Write them to a 0600 temp file instead and
    // let the expect script read and delete it immediately.
    const credsPath = path.join(os.tmpdir(), `ocgui-auth-${crypto.randomBytes(8).toString('hex')}`);
    fs.writeFileSync(
      credsPath,
      [sudoPassword, config.username.trim(), config.password.trim()].join('\n'),
      { mode: 0o600 }
    );

    const expectArgs = [
      expectScriptPath,
      openconnectPath,
      credsPath,
      ...args
    ];

    const removeCredsFile = () => {
      try {
        fs.unlinkSync(credsPath);
      } catch {
        // Already removed by the expect script
      }
    };

    sendLog('[步骤] 启动 OpenConnect 进程', 'step');
    sendLog(`[调试] Expect 脚本路径：${expectScriptPath}`, 'debug');

    const connectionStartedAt = Date.now();
    let outputBuffer = '';
    const recordOutput = (text) => {
      outputBuffer += text;
      if (outputBuffer.length > 20000) {
        outputBuffer = outputBuffer.slice(-20000);
      }
    };

    const sudoProcess = spawn('expect', expectArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    openconnectProcess = sudoProcess;

    // Track connection status
    let connected = false;
    let sudoAuthError = false;
    let vpnAuthError = false;

    // expect 的 puts 与 OpenConnect 输出都走 stdout，认证标记需要两个流都检查
    const updateAuthFlags = (output) => {
      if (output.includes('[EXPECT ERROR] 密码错误')) {
        sudoAuthError = true;
        sendLog('[错误] sudo 密码认证失败', 'error');
      }
      if (output.includes('[EXPECT ERROR] VPN 认证失败')) {
        vpnAuthError = true;
        sendLog('[错误] VPN 账号或密码不正确', 'error');
      }
      if (output.includes('[EXPECT ERROR] 超时')) {
        sendLog('[错误] 认证或连接超时', 'error');
      }
    };

    // Handle stdout
    sudoProcess.stdout.on('data', (data) => {
      const output = data.toString();
      recordOutput(output);
      logProcessOutput(output);
      updateAuthFlags(output);

      if ((output.includes('CONNECTED') || output.includes('Established') || output.includes('Configured as')) && !connected) {
        connected = true;
        updateStatus('connected');
        sendLog(`[成功] VPN 连接已建立（耗时 ${Math.round((Date.now() - connectionStartedAt) / 1000)} 秒）`, 'success');
      }
    });

    // Handle stderr - this is where OpenConnect output appears
    sudoProcess.stderr.on('data', (data) => {
      const output = data.toString();
      recordOutput(output);
      logProcessOutput(output);
      updateAuthFlags(output);

      if ((output.includes('CONNECTED') || output.includes('Established') || output.includes('Configured as')) && !connected) {
        connected = true;
        updateStatus('connected');
        sendLog(`[成功] VPN 连接已建立（耗时 ${Math.round((Date.now() - connectionStartedAt) / 1000)} 秒）`, 'success');
      }

      // Ignore vpnc-script errors (connection still works)
      if (output.includes('is not a recognized network service') || output.includes('Error: The parameters were not valid')) {
        sendLog('[警告] 路由脚本报错，但 VPN 隧道可能已建立', 'warn');
      }
    });

    // Handle process exit
    sudoProcess.on('close', async (code) => {
      removeCredsFile();
      const duration = Math.round((Date.now() - connectionStartedAt) / 1000);
      sendLog(`[调试] OpenConnect 进程已退出，退出码 ${code}，连接持续 ${duration} 秒`, 'debug');

      openconnectProcess = null;
      updateStatus('disconnected');

      if (code !== 0 && code !== null) {
        const diagnosis = await buildFailureDiagnosis({
          exitCode: code,
          output: outputBuffer,
          probe,
          serverUrl,
          sudoAuthError,
          vpnAuthError
        });
        for (const entry of diagnosis.entries) {
          sendLog(entry.message, entry.type);
        }
        notifyConnectionError(diagnosis.headline);
      } else if (code === 0 && connected) {
        // Clean exit while connected - this is unexpected
        sendLog('[警告] VPN 意外断开，可能原因：', 'warn');
        sendLog('[警告] - 网络中断或超时', 'warn');
        sendLog('[警告] - 服务端主动断开（空闲超时、策略限制等）', 'warn');
        sendLog('[警告] - MTU/DTLS 相关问题', 'warn');

        notifyConnectionError('VPN 已断开，请查看日志获取详情。');
      }
    });

    sudoProcess.on('error', (error) => {
      removeCredsFile();
      sendLog(`错误：${error.message}`, 'error');
      openconnectProcess = null;
      updateStatus('disconnected');
      notifyConnectionError(error.message);
    });

    return { success: true };
  } catch (error) {
    updateStatus('disconnected');
    return { success: false, error: error.message };
  }
}

// Handle VPN connection
ipcMain.handle('connect-vpn', async (event, config) => {
  return startConnection(config);
});

// Handle VPN disconnection
ipcMain.handle('disconnect-vpn', async () => {
  return disconnectVPN();
});

function disconnectVPN() {
  if (openconnectProcess) {
    sendLog('正在断开连接…');

    // Close stdin to signal clean shutdown
    try {
      openconnectProcess.stdin.end();
    } catch (e) {
      // Ignore errors if stdin already closed
    }

    // Send SIGINT for graceful shutdown
    openconnectProcess.kill('SIGINT');

    // Give it 5 seconds to shut down gracefully, then force kill
    setTimeout(() => {
      if (openconnectProcess) {
        sendLog('正在强制结束 OpenConnect 进程…');
        openconnectProcess.kill('SIGKILL');
        openconnectProcess = null;
        updateStatus('disconnected');
      }
    }, 5000);

    return { success: true };
  }
  return { success: false, error: '当前未连接' };
}

// Get connection status
ipcMain.handle('get-status', async () => {
  return connectionStatus;
});

// Get application version (single source of truth: package.json / Info.plist)
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// 渲染层「关于」页：检查更新
ipcMain.handle('check-for-update', async () => {
  try {
    const result = await updater.checkForUpdate(app.getVersion());
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 渲染层「关于」页：下载并打开更新安装包（下载完成后由系统通知/弹窗反馈）
ipcMain.handle('download-update', async () => {
  if (updateDownloadInProgress) {
    return { success: false, error: '正在下载更新，请稍候' };
  }

  try {
    const result = await updater.checkForUpdate(app.getVersion());
    if (!result.updateAvailable) {
      return { success: false, error: '当前已是最新版本' };
    }

    updateDownloadInProgress = true;
    downloadUpdate(result)
      .catch(() => {})
      .finally(() => {
        updateDownloadInProgress = false;
      });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 仅允许打开 GitHub 与作者站点链接，避免渲染层打开任意地址
ipcMain.handle('open-external', async (event, url) => {
  const value = String(url || '');
  if (!/^https:\/\/(github\.com|manishj\.com)\//.test(value)) {
    return { success: false, error: '不允许打开该链接' };
  }
  await shell.openExternal(value);
  return { success: true };
});

// Save profiles (passwords encrypted via the OS keychain when available)
ipcMain.handle('save-profiles', async (event, profiles) => {
  const result = profileStore.saveProfiles(PROFILES_FILE, profiles);
  if (result.success) {
    // 配置变化后同步刷新托盘里的快速连接列表
    updateTrayMenu();
  }
  return result;
});

// Load profiles (transparently migrates legacy plaintext files)
ipcMain.handle('load-profiles', async () => {
  return profileStore.loadProfiles(PROFILES_FILE);
});

// Check if openconnect is installed
ipcMain.handle('check-openconnect', async () => {
  return checkOpenConnect();
});

// Check for running openconnect processes
ipcMain.handle('check-running-processes', async () => {
  return new Promise((resolve) => {
    // Look for actual openconnect VPN processes, not the GUI app
    exec('ps aux | grep -E "sudo.*openconnect|/usr.*openconnect|/opt.*openconnect" | grep -v grep | grep -v "openconnect-gui"', (error, stdout, stderr) => {
      if (error && error.code !== 1) {
        // Code 1 means no processes found, which is not an error
        resolve({ success: false, error: stderr || error.message, processes: [] });
        return;
      }

      const processes = stdout.trim().split('\n').filter(line => line.length > 0);
      resolve({
        success: true,
        processes: processes,
        count: processes.length
      });
    });
  });
});

// Kill a process by PID
ipcMain.handle('kill-process', async (event, pid, sudoPassword) => {
  return new Promise((resolve) => {
    if (!pid) {
      resolve({ success: false, error: '缺少 PID' });
      return;
    }

    // Validate PID is a positive integer (prevent command injection)
    const pidNumber = parseInt(pid, 10);
    if (!Number.isInteger(pidNumber) || pidNumber <= 0 || pidNumber.toString() !== pid.toString()) {
      resolve({ success: false, error: 'PID 格式无效' });
      return;
    }

    if (!sudoPassword) {
      resolve({
        success: false,
        error: '结束进程需要 sudo 密码',
        needsSudo: true
      });
      return;
    }

    // Use spawn with sudo -S to pass password via stdin
    // PID is validated as integer, safe to use in command
    const sudoProcess = spawn('sudo', ['-S', 'kill', '-9', pidNumber.toString()], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    sudoProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    sudoProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    sudoProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: `进程 ${pid} 已结束` });
      } else {
        // Check for common error messages
        if (stderr.includes('Sorry, try again') || stderr.includes('incorrect password')) {
          resolve({
            success: false,
            error: 'sudo 密码错误',
            incorrectPassword: true
          });
        } else if (stderr.includes('No such process')) {
          resolve({
            success: false,
            error: `进程 ${pid} 不存在或已终止`
          });
        } else {
          resolve({
            success: false,
            error: stderr || `结束进程失败，退出码 ${code}`
          });
        }
      }
    });

    sudoProcess.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    // Send password to sudo
    sudoProcess.stdin.write(sudoPassword + '\n');
    sudoProcess.stdin.end();
  });
});

// Install OpenConnect via the bundled script
ipcMain.handle('install-openconnect', async () => {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scripts', 'install-openconnect.sh');

    // Check if running in development or production
    const actualScriptPath = fs.existsSync(scriptPath)
      ? scriptPath
      : path.join(process.resourcesPath, 'scripts', 'install-openconnect.sh');

    if (!fs.existsSync(actualScriptPath)) {
      resolve({ success: false, error: '未找到安装脚本' });
      return;
    }

    // Open Terminal and run the script
    const command = `osascript -e 'tell application "Terminal" to do script "bash \\"${actualScriptPath}\\"; exit"'`;

    exec(command, (error) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

// Open Terminal
ipcMain.on('open-terminal', () => {
  shell.openPath('/System/Applications/Utilities/Terminal.app');
});

// Network diagnostics: Get routing table
ipcMain.handle('get-routes', async () => {
  return new Promise((resolve) => {
    exec('netstat -rn', (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr || error.message });
        return;
      }

      resolve({ success: true, routes: parsers.parseRoutes(stdout) });
    });
  });
});

// 网速：读取各接口累计字节数与当前 VPN/物理接口
ipcMain.handle('get-network-stats', async () => {
  try {
    return await readNetworkStats();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 网速：通过国际节点测量延迟与上下行吞吐
ipcMain.handle('run-speed-test', async (event) => {
  if (speedTestInProgress) {
    return { success: false, error: '测速正在进行中，请稍候' };
  }

  speedTestInProgress = true;
  const sendProgress = (data) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('speed-test-progress', data);
    }
  };

  try {
    return await runSpeedTest(sendProgress);
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    speedTestInProgress = false;
  }
});

// Network diagnostics: Test connectivity to a host
ipcMain.handle('test-connectivity', async (event, host, port) => {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve({ success: false, error: '需要提供主机和端口' });
      return;
    }

    // Validate port is a number between 1-65535
    const portNumber = parseInt(port, 10);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      resolve({ success: false, error: '端口号无效' });
      return;
    }

    // Validate host format (basic hostname/IP validation)
    // Allow alphanumeric, dots, hyphens, and colons (for IPv6)
    const validHostPattern = /^[a-zA-Z0-9\.\-:]+$/;
    if (!validHostPattern.test(host)) {
      resolve({ success: false, error: '主机格式无效' });
      return;
    }

    const timeout = 5000;
    // Use spawn instead of exec to prevent command injection
    const ncProcess = spawn('nc', ['-zv', '-G', '5', host, portNumber.toString()], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    ncProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ncProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ncProcess.on('close', (code) => {
      const output = stdout + stderr;
      const success = code === 0 && (output.includes('succeeded') || output.includes('open'));

      resolve({
        success,
        host,
        port: portNumber,
        message: output.trim(),
        reachable: success
      });
    });

    ncProcess.on('error', (error) => {
      resolve({
        success: false,
        host,
        port: portNumber,
        message: error.message,
        reachable: false
      });
    });

    // Set timeout
    setTimeout(() => {
      if (!ncProcess.killed) {
        ncProcess.kill();
        resolve({
          success: false,
          host,
          port: portNumber,
          message: '连接超时',
          reachable: false
        });
      }
    }, timeout);
  });
});

// Network diagnostics: Delete a route
ipcMain.handle('delete-route', async (event, destination, sudoPassword) => {
  return new Promise((resolve) => {
    if (!destination) {
      resolve({ success: false, error: '缺少目标地址' });
      return;
    }

    // Validate destination format to prevent command injection
    // Allow: IP addresses, CIDR notation, or "default"
    const validDestinationPattern = /^(default|(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?)$/;
    if (!validDestinationPattern.test(destination)) {
      resolve({ success: false, error: '目标地址格式无效' });
      return;
    }

    if (!sudoPassword) {
      resolve({
        success: false,
        error: '需要 sudo 密码',
        needsSudo: true
      });
      return;
    }

    // Use spawn with sudo -S to pass password via stdin
    // Destination is validated, safe to use in command
    const sudoProcess = spawn('sudo', ['-S', 'route', 'delete', destination], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    sudoProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    sudoProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    sudoProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: `已删除到 ${destination} 的路由` });
      } else {
        // Check for common error messages
        if (stderr.includes('Sorry, try again') || stderr.includes('incorrect password')) {
          resolve({
            success: false,
            error: 'sudo 密码错误',
            incorrectPassword: true
          });
        } else {
          resolve({
            success: false,
            error: stderr || `操作失败，退出码 ${code}`
          });
        }
      }
    });

    sudoProcess.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    // Send password to sudo
    sudoProcess.stdin.write(sudoPassword + '\n');
    sudoProcess.stdin.end();
  });
});

// Network diagnostics: Get network interfaces
ipcMain.handle('get-network-interfaces', async () => {
  return new Promise((resolve) => {
    exec('ifconfig', (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr || error.message });
        return;
      }

      resolve({ success: true, interfaces: parsers.parseNetworkInterfaces(stdout) });
    });
  });
});

// Handle successful OpenConnect installation
ipcMain.on('openconnect-installed', () => {
  if (installerWindow) {
    installerWindow.close();
  }
  // Refresh the main window to re-check OpenConnect
  if (mainWindow) {
    mainWindow.reload();
  }
});

// Splash screen IPC handlers
ipcMain.on('splash-loaded', async () => {
  // Wait a bit for splash to render, then start system checks
  setTimeout(async () => {
    const checksPass = await performSystemChecks();

    if (!checksPass) {
      // System checks failed, keep splash open
      return;
    }
  }, 500);
});

ipcMain.on('splash-ready', () => {
  // System checks passed, create and show main window
  createWindow();

  // Close splash after a short delay
  setTimeout(() => {
    if (splashWindow) {
      splashWindow.close();
    }
  }, 300);

  // Show main window when ready
  if (mainWindow) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();

      // Create tray after main window is shown
      try {
        if (!tray) {
          createTray();
        }
      } catch (error) {
        console.log('托盘图标创建失败，已跳过托盘：', error.message);
      }
    });
  }
});

ipcMain.on('open-installer', () => {
  createInstallerWindow();
});

// Helper functions
function updateStatus(status) {
  connectionStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-changed', status);
  }
  if (status === 'connected') {
    notifyConnected();
  }
  updateTrayMenu();
}

function sendLog(message, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-message', { message, type, timestamp: new Date().toISOString() });
  }
}

// 主窗口隐藏时（例如从托盘快速连接），用系统弹窗给出失败反馈
function notifyConnectionError(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('connection-error', message);
    if (mainWindow.isVisible()) {
      return;
    }
  }
  dialog.showMessageBox({
    type: 'error',
    title: 'OpenConnect VPN',
    message,
    buttons: ['确定']
  });
}

// 连接成功且主窗口不可见时，用系统通知告知用户
function notifyConnected() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    return;
  }
  if (Notification.isSupported()) {
    new Notification({ title: 'VPN 已连接', body: 'OpenConnect VPN 连接已建立' }).show();
  }
}

async function promptForSudoPassword() {
  return new Promise((resolve) => {
    // Create a simple dialog to get sudo password
    sendLog('[调试] 正在创建 sudo 密码输入窗口…', 'info');

    // 从托盘快速连接时主窗口可能处于隐藏状态，此时不要挂为模态子窗口
    const hasVisibleParent = Boolean(
      mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
    );

    const promptWindow = new BrowserWindow({
      width: 520,
      height: 400,
      parent: hasVisibleParent ? mainWindow : undefined,
      modal: hasVisibleParent,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
      promptWindow.loadURL('http://localhost:5173/pages/password-prompt.html');
    } else {
      promptWindow.loadFile(path.join(__dirname, 'dist', 'pages', 'password-prompt.html'));
    }

    ipcMain.once('sudo-password-entered', (event, password) => {
      sendLog('[调试] 用户已提交 sudo 密码', 'info');
      promptWindow.close();
      resolve(password);
    });

    promptWindow.on('closed', () => {
      sendLog('[调试] sudo 密码输入窗口已关闭', 'info');
      // If window was closed without entering password, resolve with null
      resolve(null);
    });

    promptWindow.once('ready-to-show', () => {
      sendLog('[调试] sudo 密码输入窗口已就绪', 'info');
      promptWindow.show();
    });

    // Fallback: show after a short delay if ready-to-show doesn't fire
    setTimeout(() => {
      if (promptWindow && !promptWindow.isDestroyed() && !promptWindow.isVisible()) {
        sendLog('[调试] 强制显示 sudo 密码输入窗口（兜底）', 'info');
        promptWindow.show();
      }
    }, 100);
  });
}

// App lifecycle
app.whenReady().then(() => {
  const loginItemSettings = app.getLoginItemSettings();

  // 由“开机自动启动”拉起时：跳过启动页，创建隐藏的主窗口并直接驻留托盘，
  // 避免登录后弹窗打断用户。
  if (app.isPackaged && loginItemSettings.wasOpenedAtLogin) {
    createWindow();
    try {
      createTray();
    } catch (error) {
      console.log('托盘图标创建失败，已跳过托盘：', error.message);
    }
  } else {
    // Show splash screen first
    createSplashWindow();
  }

  // 启动后静默检查更新（仅打包版），有新版本时用系统通知提示
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdatesSilently();
    }, 8000);
  }

  // Don't create main window yet - wait for splash to complete

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      return;
    }
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (openconnectProcess) {
    openconnectProcess.kill('SIGTERM');
  }
});
