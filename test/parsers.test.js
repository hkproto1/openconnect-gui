const test = require('node:test');
const assert = require('node:assert');
const { parseRoutes, parseNetworkInterfaces } = require('../src/main/parsers');

const NETSTAT_SAMPLE = `Routing tables

Internet:
Destination        Gateway            Flags               Netif Expire
default            192.168.1.1        UGScg                 en0
10.0.0.1           172.20.10.1        UGSc                  en0
127.0.0.1          127.0.0.1          UH                    lo0
192.168.1.100      link#6             UCS                   en0      !
Internet6:
Destination                             Gateway                         Flags               Netif Expire
default                                 fe80::1%en0                     UGcg                  en0
`;

const IFCONFIG_SAMPLE = `lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
	inet 127.0.0.1 netmask 0xff000000
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	status: active
	inet 192.168.1.100 netmask 0xffffff00 broadcast 192.168.1.255
utun0: flags=8051<UP,POINTOPOINT,RUNNING,MULTICAST> mtu 1380
`;

test('parseRoutes extracts IPv4 routes and skips the header', () => {
  const routes = parseRoutes(NETSTAT_SAMPLE);

  assert.equal(routes.length, 4);
  assert.deepEqual(routes[0], {
    destination: 'default',
    gateway: '192.168.1.1',
    flags: 'UGScg',
    interface: 'en0'
  });
  assert.equal(routes[1].gateway, '172.20.10.1');
  assert.ok(routes.every((route) => route.destination !== 'Destination'));
});

test('parseRoutes ignores the IPv6 section', () => {
  const routes = parseRoutes(NETSTAT_SAMPLE);
  assert.ok(routes.every((route) => !String(route.gateway).includes('fe80')));
});

test('parseRoutes returns an empty list for empty output', () => {
  assert.deepEqual(parseRoutes(''), []);
});

test('parseNetworkInterfaces parses status and IPv4 address', () => {
  const interfaces = parseNetworkInterfaces(IFCONFIG_SAMPLE);

  // utun0 has neither an address nor a status line, so it is skipped
  assert.equal(interfaces.length, 2);
  assert.deepEqual(interfaces[0], { name: 'lo0', status: 'unknown', ip: '127.0.0.1' });
  assert.deepEqual(interfaces[1], { name: 'en0', status: 'active', ip: '192.168.1.100' });
});

test('parseNetworkInterfaces ignores sections without an address or status', () => {
  const interfaces = parseNetworkInterfaces('awdl0: flags=8943<UP,BROADCAST,RUNNING> mtu 1484\n');
  assert.deepEqual(interfaces, []);
});

test('parseNetworkInterfaces returns an empty list for empty output', () => {
  assert.deepEqual(parseNetworkInterfaces(''), []);
});
