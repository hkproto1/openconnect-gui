const test = require('node:test');
const assert = require('node:assert');

const routes = require('../src/main/routes');

const CURRENT_ADDRESSES = ['10.143.231.50'];

test('isPrivateGateway 只识别私网网关', () => {
  assert.strictEqual(routes.isPrivateGateway('10.151.116.101'), true);
  assert.strictEqual(routes.isPrivateGateway('192.168.1.1'), true);
  assert.strictEqual(routes.isPrivateGateway('172.20.3.4'), true);
  assert.strictEqual(routes.isPrivateGateway('172.4.3.4'), false);
  assert.strictEqual(routes.isPrivateGateway('203.0.113.1'), false);
  assert.strictEqual(routes.isPrivateGateway(''), false);
});

test('findHostRoute 与 findDefaultRoute 返回对应路由', () => {
  const table = [
    { destination: 'default', gateway: '10.143.231.89', flags: 'UGScg', interface: 'en0' },
    { destination: '178.94.14.180', gateway: '10.151.116.101', flags: 'UGHS', interface: 'utun4' }
  ];
  assert.strictEqual(routes.findHostRoute(table, '178.94.14.180').interface, 'utun4');
  assert.strictEqual(routes.findHostRoute(table, '203.0.113.7'), null);
  assert.strictEqual(routes.findDefaultRoute(table).gateway, '10.143.231.89');
  assert.strictEqual(routes.findDefaultRoute([]), null);
});

test('findStaleHostRoute 识别指向旧网段网关的残留路由', () => {
  const table = [
    { destination: 'default', gateway: '10.143.231.89', flags: 'UGScg', interface: 'en0' },
    { destination: '178.94.14.180', gateway: '10.151.116.101', flags: 'UGHS', interface: 'utun4' }
  ];
  const stale = routes.findStaleHostRoute(table, '178.94.14.180', CURRENT_ADDRESSES);
  assert.ok(stale);
  assert.strictEqual(stale.gateway, '10.151.116.101');
});

test('findStaleHostRoute 跳过当前网段内的网关', () => {
  const table = [
    { destination: '178.94.14.180', gateway: '10.143.231.89', flags: 'UGHS', interface: 'en0' }
  ];
  assert.strictEqual(routes.findStaleHostRoute(table, '178.94.14.180', CURRENT_ADDRESSES), null);
});

test('findStaleHostRoute 跳过 link# 网关与公网网关', () => {
  const table = [
    { destination: '178.94.14.180', gateway: 'link#14', flags: 'UHLS', interface: 'en0' },
    { destination: '203.0.113.7', gateway: '203.0.113.1', flags: 'UGHS', interface: 'en0' }
  ];
  assert.strictEqual(routes.findStaleHostRoute(table, '178.94.14.180', CURRENT_ADDRESSES), null);
  assert.strictEqual(routes.findStaleHostRoute(table, '203.0.113.7', CURRENT_ADDRESSES), null);
});

test('findStaleHostRoute 无匹配目标时返回 null', () => {
  const table = [
    { destination: 'default', gateway: '10.143.231.89', flags: 'UGScg', interface: 'en0' }
  ];
  assert.strictEqual(routes.findStaleHostRoute(table, '178.94.14.180', CURRENT_ADDRESSES), null);
  assert.strictEqual(routes.findStaleHostRoute([], '178.94.14.180', CURRENT_ADDRESSES), null);
});

test('ipv4FromNetworkInterfaces 只保留非回环 IPv4 地址', () => {
  const interfaces = {
    en0: [{ address: '10.143.231.50', family: 'IPv4', internal: false }],
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    utun4: [
      { address: 'fe80::1234', family: 'IPv6', internal: false },
      { address: '10.151.116.20', family: 4, internal: false }
    ]
  };
  assert.deepStrictEqual(routes.ipv4FromNetworkInterfaces(interfaces), ['10.143.231.50', '10.151.116.20']);
  assert.deepStrictEqual(routes.ipv4FromNetworkInterfaces(null), []);
});

test('extractHost 兼容 URL 与裸主机名', () => {
  assert.strictEqual(routes.extractHost('https://vpn.example.com/'), 'vpn.example.com');
  assert.strictEqual(routes.extractHost('vpn.example.com:443'), 'vpn.example.com');
  assert.strictEqual(routes.extractHost('178.94.14.180'), '178.94.14.180');
  assert.strictEqual(routes.extractHost(''), '');
});
