// macOS 网络统计解析与接口判定，保留为纯函数以便单测
function parseInterfaceCounters(stdout) {
  const counters = [];
  const seen = new Set();

  for (const line of String(stdout).split('\n')) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'Name' || parts.length < 10) continue;

    const name = parts[0].replace(/\*$/, '');
    if (seen.has(name)) continue;

    // netstat -ib 各行的地址列可能为空，从行尾取字节数更稳妥
    const ibytes = parseInt(parts[parts.length - 5], 10);
    const obytes = parseInt(parts[parts.length - 2], 10);
    if (!Number.isFinite(ibytes) || !Number.isFinite(obytes)) continue;

    seen.add(name);
    counters.push({ name, ibytes, obytes });
  }

  return counters;
}

// 从 ifconfig 接口与路由表中找出当前 VPN 使用的 utun 接口
function selectVpnInterface(interfaces, routes, counters) {
  const counterMap = new Map((counters || []).map((item) => [item.name, item]));
  const routeInterfaces = new Set(
    (routes || [])
      .map((route) => route.interface)
      .filter((name) => /^utun\d+$/.test(name))
  );

  const totalBytes = (name) => {
    const counter = counterMap.get(name);
    return counter ? counter.ibytes + counter.obytes : 0;
  };

  const candidates = (interfaces || []).filter(
    (item) => /^utun\d+$/.test(item.name) && item.ip
  );

  const sortCandidates = (list) => list.slice().sort((a, b) => {
    const routeScore = Number(routeInterfaces.has(b.name)) - Number(routeInterfaces.has(a.name));
    if (routeScore !== 0) return routeScore;
    return totalBytes(b.name) - totalBytes(a.name);
  });

  if (candidates.length > 0) {
    return sortCandidates(candidates)[0].name;
  }

  const routeOnly = Array.from(routeInterfaces)
    .filter((name) => counterMap.has(name))
    .map((name) => ({ name, ip: null }));
  return routeOnly.length > 0 ? sortCandidates(routeOnly)[0].name : null;
}

// 结合连接状态与默认路由说明测速实际走的线路
function describeRoute({ connectionStatus, vpnInterface, defaultRoute }) {
  if (connectionStatus !== 'connected' || !vpnInterface) {
    return {
      mode: 'direct',
      label: '直连（未连接 VPN）',
      interface: defaultRoute ? defaultRoute.interface : null
    };
  }

  if (defaultRoute && /^utun\d+$/.test(defaultRoute.interface)) {
    return {
      mode: 'vpn',
      label: `VPN 全隧道（${defaultRoute.interface}）`,
      interface: defaultRoute.interface
    };
  }

  return {
    mode: 'split',
    label: `VPN 分流（默认走 ${defaultRoute ? defaultRoute.interface : '未知接口'}）`,
    interface: defaultRoute ? defaultRoute.interface : null
  };
}

module.exports = {
  parseInterfaceCounters,
  selectVpnInterface,
  describeRoute
};
