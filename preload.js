const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Application metadata
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Update checks and external links
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // VPN connection methods
  connectVPN: (config) => ipcRenderer.invoke('connect-vpn', config),
  disconnectVPN: () => ipcRenderer.invoke('disconnect-vpn'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  checkOpenConnect: () => ipcRenderer.invoke('check-openconnect'),

  // Profile management methods
  saveProfiles: (profiles) => ipcRenderer.invoke('save-profiles', profiles),
  loadProfiles: () => ipcRenderer.invoke('load-profiles'),

  // Process management
  checkRunningProcesses: () => ipcRenderer.invoke('check-running-processes'),
  killProcess: (pid, sudoPassword) => ipcRenderer.invoke('kill-process', pid, sudoPassword),

  // Network diagnostics
  getRoutes: () => ipcRenderer.invoke('get-routes'),
  testConnectivity: (host, port) => ipcRenderer.invoke('test-connectivity', host, port),
  deleteRoute: (destination, sudoPassword) => ipcRenderer.invoke('delete-route', destination, sudoPassword),
  getNetworkInterfaces: () => ipcRenderer.invoke('get-network-interfaces'),

  // Network speed
  getNetworkStats: () => ipcRenderer.invoke('get-network-stats'),
  runSpeedTest: () => ipcRenderer.invoke('run-speed-test'),
  onSpeedTestProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('speed-test-progress', listener);
    return () => ipcRenderer.removeListener('speed-test-progress', listener);
  },

  // Event listeners
  onStatusChanged: (callback) => {
    ipcRenderer.on('status-changed', (event, status) => callback(status));
  },
  onLogMessage: (callback) => {
    ipcRenderer.on('log-message', (event, log) => callback(log));
  },
  onConnectionError: (callback) => {
    ipcRenderer.on('connection-error', (event, error) => callback(error));
  }
});
