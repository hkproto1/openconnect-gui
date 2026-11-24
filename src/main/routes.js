const { exec, spawn } = require('child_process');
const dns = require('dns');
const os = require('os');
const parsers = require('./parsers');

// 仅把私网网关视为“可能来自旧网络”的残留路由，避免误删正常路由
const PRIVATE_GATEWAY_PATTERN = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/;

function isPrivateGateway(gateway) {
  return PRIVATE_GATEWAY_PATTERN.test(String(gateway || ''));
}

function subnet24(ip) {
  return String(ip).split('.').slice(0, 3).join('.');
}

function isGatewayInCurrentNetwork(gateway, addresses) {
  return addresses.some((ip) => subnet24(ip) === subnet24(gateway));
}

// 从 os.networkInterfaces() 提取本机所有非回环 IPv4 地址
function ipv4FromNetworkInterfaces(interfaces) {
  const addresses = [];
  for (const list of Object.values(interfaces || {})) {
    for (const addr of list || []) {
      if (!addr || addr.internal) continue;
      if (addr.family === 'IPv4' || addr.family === 4) {
        addresses.push(addr.address);
      }
    }
  }
  return addresses;
}

// 查找指向服务器 IP 的主机路由
function findHostRoute(routes, hostIp) {
  return (routes || []).find((item) => item.destination === hostIp) || null;
}

// 查找默认路由，用于日志中说明当前出口网关
function findDefaultRoute(routes) {
  return (routes || []).find((item) => item.destination === 'default') || null;
}

// 找出指向服务器 IP、但网关不在当前网段的残留主机路由
function findStaleHostRoute(routes, hostIp, addresses) {
  const route = findHostRoute(routes, hostIp);
  if (!route) return null;
  if (String(route.gateway).startsWith('link#')) return null;
  if (!isPrivateGateway(route.gateway)) return null;
  if (isGatewayInCurrentNetwork(route.gateway, addresses)) return null;
  return route;
}

function extractHost(serverUrl) {
  const value = String(serverUrl || '');
  try {
    const normalized = /^https?:\/\//.test(value) ? value : `https://${value}`;
    return new URL(normalized).hostname;
  } catch {
    return value.split(':')[0];
  }
}

function resolveHostIPv4(host) {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return Promise.resolve(host);
  }
  return new Promise((resolve) => {
    dns.lookup(host, { family: 4 }, (error, address) => {
      resolve(error ? null : address);
    });
  });
}

function readRoutingTable() {
  return new Promise((resolve, reject) => {
    exec('netstat -rn', (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(parsers.parseRoutes(stdout));
    });
  });
}

function deleteHostRoute(destination, sudoPassword) {
  return new Promise((resolve) => {
    const child = spawn('sudo', ['-S', 'route', 'delete', destination], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
        return;
      }
      if (stderr.includes('Sorry, try again') || stderr.includes('incorrect password')) {
        resolve({ success: false, incorrectPassword: true, error: 'sudo 密码错误' });
        return;
      }
      resolve({
        success: false,
        error: (stderr || stdout || `route delete 失败，退出码 ${code}`).trim()
      });
    });

    child.stdin.write(`${sudoPassword}\n`);
    child.stdin.end();
  });
}

// 检查服务器地址、当前路由、本机地址与残留路由，供连接前后诊断使用
async function inspectServerRoute(serverUrl) {
  const host = extractHost(serverUrl);
  const ip = await resolveHostIPv4(host);
  if (!ip) {
    return { checked: false, resolved: false, host };
  }

  const table = await readRoutingTable();
  const addresses = ipv4FromNetworkInterfaces(os.networkInterfaces());
  const existingRoute = findHostRoute(table, ip);
  const defaultRoute = findDefaultRoute(table);

  return {
    checked: true,
    resolved: true,
    host,
    ip,
    addresses,
    existingRoute,
    defaultRoute,
    staleRoute: findStaleHostRoute(table, ip, addresses)
  };
}

module.exports = {
  isPrivateGateway,
  ipv4FromNetworkInterfaces,
  isGatewayInCurrentNetwork,
  findHostRoute,
  findDefaultRoute,
  findStaleHostRoute,
  extractHost,
  inspectServerRoute,
  deleteHostRoute
};
