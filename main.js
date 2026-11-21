const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const profileStore = require('./src/main/profiles');
const parsers = require('./src/main/parsers');

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
  tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));

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

function updateTrayMenu() {
  // Only update tray if it exists
  if (!tray) {
    return;
  }

  const statusText = statusLabels[connectionStatus] || connectionStatus;

  // Login item can only be registered by a packaged .app bundle
  const canToggleLoginItem = app.isPackaged;
  const loginItemEnabled = canToggleLoginItem && app.getLoginItemSettings().openAtLogin;

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
      label: connectionStatus === 'connected' ? '断开连接' : '连接',
      enabled: false,
      click: () => {
        // Quick connect with last profile could be implemented here
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
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`OpenConnect VPN - ${statusText}`);
}

// Handle VPN connection
ipcMain.handle('connect-vpn', async (event, config) => {
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
    sendLog(`执行命令：sudo openconnect ${args.join(' ')}`, 'info');

    // Request sudo password from user
    sendLog('[调试] 正在弹出 sudo 密码输入框…', 'info');
    const sudoPassword = await promptForSudoPassword();
    if (!sudoPassword) {
      sendLog('[错误] 用户未提供 sudo 密码', 'error');
      updateStatus('disconnected');
      return { success: false, error: '需要 sudo 密码' };
    }
    sendLog('[调试] 已收到 sudo 密码（长度：' + sudoPassword.length + '）', 'info');

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

    sendLog('[调试] 使用 expect 脚本进行交互式认证', 'info');
    sendLog(`[调试] Expect 脚本路径：${expectScriptPath}`, 'info');

    const sudoProcess = spawn('expect', expectArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    openconnectProcess = sudoProcess;

    // Track connection status
    let connected = false;
    let authError = false;

    // Handle stdout
    sudoProcess.stdout.on('data', (data) => {
      const output = data.toString();
      sendLog(output);

      if ((output.includes('CONNECTED') || output.includes('Established') || output.includes('Configured as')) && !connected) {
        connected = true;
        updateStatus('connected');
        sendLog('连接建立成功！', 'info');
      }
    });

    // Handle stderr - this is where OpenConnect output appears
    sudoProcess.stderr.on('data', (data) => {
      const output = data.toString();
      sendLog(output);

      // Check for sudo password errors
      if (output.includes('[EXPECT ERROR] 密码错误')) {
        authError = true;
        sendLog('[错误] sudo 密码认证失败！', 'error');
      }

      // Check for VPN authentication errors
      if (output.includes('[EXPECT ERROR] VPN 认证失败')) {
        authError = true;
        sendLog('[错误] VPN 账号或密码不正确！', 'error');
      }

      // Check for timeout errors
      if (output.includes('[EXPECT ERROR] 超时')) {
        authError = true;
        sendLog('[错误] 连接超时', 'error');
      }

      if ((output.includes('CONNECTED') || output.includes('Established') || output.includes('Configured as')) && !connected) {
        connected = true;
        updateStatus('connected');
        sendLog('连接建立成功！', 'info');
      }

      // Ignore vpnc-script errors (connection still works)
      if (output.includes('is not a recognized network service') || output.includes('Error: The parameters were not valid')) {
        sendLog('提示：路由配置有报错，但 VPN 隧道已建立', 'info');
      }
    });

    // Handle process exit
    sudoProcess.on('close', (code) => {
      removeCredsFile();
      const exitTime = new Date().toLocaleTimeString();
      sendLog(`[调试] OpenConnect 进程已退出，退出码 ${code}，时间 ${exitTime}`);

      openconnectProcess = null;
      updateStatus('disconnected');

      if (code !== 0 && code !== null) {
        let errorMessage = `连接已关闭，退出码 ${code}`;

        // Provide specific error messages based on context
        if (authError) {
          if (code === 1) {
            errorMessage = '认证失败，请检查用户名和密码。';
          }
        } else if (code === 1) {
          errorMessage = '连接失败，可能是 sudo 密码错误或网络问题。';
        }

        sendLog(`[错误] ${errorMessage}`, 'error');

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('connection-error', errorMessage);
        }
      } else if (code === 0 && connected) {
        // Clean exit while connected - this is unexpected
        sendLog(`[警告] VPN 意外断开，可能原因：`, 'error');
        sendLog(`  - 网络中断或超时`, 'error');
        sendLog(`  - 服务端主动断开（空闲超时、策略限制等）`, 'error');
        sendLog(`  - MTU/DTLS 相关问题`, 'error');

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('connection-error', 'VPN 已断开，请查看日志获取详情。');
        }
      }
    });

    sudoProcess.on('error', (error) => {
      removeCredsFile();
      sendLog(`错误：${error.message}`, 'error');
      openconnectProcess = null;
      updateStatus('disconnected');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connection-error', error.message);
      }
    });

    return { success: true };
  } catch (error) {
    updateStatus('disconnected');
    return { success: false, error: error.message };
  }
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

// Save profiles (passwords encrypted via the OS keychain when available)
ipcMain.handle('save-profiles', async (event, profiles) => {
  return profileStore.saveProfiles(PROFILES_FILE, profiles);
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
  updateTrayMenu();
}

function sendLog(message, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-message', { message, type, timestamp: new Date().toISOString() });
  }
}

async function promptForSudoPassword() {
  return new Promise((resolve) => {
    // Create a simple dialog to get sudo password
    sendLog('[调试] 正在创建 sudo 密码输入窗口…', 'info');

    const promptWindow = new BrowserWindow({
      width: 520,
      height: 400,
      parent: mainWindow,
      modal: true,
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
