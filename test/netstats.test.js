const test = require('node:test');
const assert = require('node:assert');

const netstats = require('../src/main/netstats');

const NETSTAT_OUTPUT = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                      100     0      2000      100     0      2000     0
lo0        16384 127           localhost         100     -      2000      100     -      2000     -
en0        1500  <Link#5>     aa:bb:cc:dd:ee:ff 500     0   3000000      400     0   1000000     0
en0        1500  10.143.231    10.143.231.50     500     0   3000000      400     0   1000000     0
utun4      1500  <Link#12>                       300     0   5000000      200     0    2000000     0
utun4      1500  10.151.116    10.151.116.20     300     0   5000000      200     0    2000000     0
`;

test('parseInterfaceCounters 按接口去重并读取收发字节数', () => {
  const counters = netstats.parseInterfaceCounters(NETSTAT_OUTPUT);
  assert.deepStrictEqual(
    counters.map((item) => [item.name, item.ibytes, item.obytes]),
    [
      ['lo0', 2000, 2000],
      ['en0', 3000000, 1000000],
      ['utun4', 5000000, 2000000]
    ]
  );
});

test('parseInterfaceCounters 忽略表头与无效行', () => {
  assert.deepStrictEqual(netstats.parseInterfaceCounters('Name Mtu\nnot a row\n'), []);
  assert.deepStrictEqual(netstats.parseInterfaceCounters(''), []);
});

test('selectVpnInterface 优先选择路由表中使用的 utun', () => {
  const interfaces = [
    { name: 'en0', status: 'active', ip: '10.143.231.50' },
    { name: 'utun3', status: 'unknown', ip: '10.0.0.2' },
    { name: 'utun4', status: 'unknown', ip: '10.151.116.20' }
  ];
  const routes = [
    { destination: 'default', gateway: '10.143.231.89', flags: 'UGScg', interface: 'en0' },
    { destination: '178.94.14.180', gateway: '10.143.231.89', flags: 'UGHS', interface: 'utun4' }
  ];
  const counters = [
    { name: 'utun3', ibytes: 9000000, obytes: 8000000 },
    { name: 'utun4', ibytes: 5000000, obytes: 2000000 }
  ];
  assert.strictEqual(netstats.selectVpnInterface(interfaces, routes, counters), 'utun4');
});

test('selectVpnInterface 没有路由信息时按流量选择，无 utun 时返回 null', () => {
  const interfaces = [
    { name: 'utun3', status: 'unknown', ip: '10.0.0.2' },
    { name: 'utun4', status: 'unknown', ip: '10.151.116.20' }
  ];
  const counters = [
    { name: 'utun3', ibytes: 1000, obytes: 1000 },
    { name: 'utun4', ibytes: 5000, obytes: 5000 }
  ];
  assert.strictEqual(netstats.selectVpnInterface(interfaces, [], counters), 'utun4');
  assert.strictEqual(netstats.selectVpnInterface([{ name: 'en0', ip: '10.0.0.1' }], [], []), null);
});

test('describeRoute 区分直连、全隧道与分流', () => {
  const direct = netstats.describeRoute({
    connectionStatus: 'disconnected',
    vpnInterface: null,
    defaultRoute: { interface: 'en0' }
  });
  assert.strictEqual(direct.mode, 'direct');

  const full = netstats.describeRoute({
    connectionStatus: 'connected',
    vpnInterface: 'utun4',
    defaultRoute: { interface: 'utun4' }
  });
  assert.strictEqual(full.mode, 'vpn');

  const split = netstats.describeRoute({
    connectionStatus: 'connected',
    vpnInterface: 'utun4',
    defaultRoute: { interface: 'en0' }
  });
  assert.strictEqual(split.mode, 'split');
});
