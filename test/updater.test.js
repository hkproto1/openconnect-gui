const test = require('node:test');
const assert = require('node:assert');

const updater = require('../src/main/updater');

test('compareVersions 按数值比较主版本号', () => {
  assert.strictEqual(updater.compareVersions('1.2.0', '1.1.1'), 1);
  assert.strictEqual(updater.compareVersions('1.1.1', '1.2.0'), -1);
  assert.strictEqual(updater.compareVersions('1.10.0', '1.2.0'), 1);
  assert.strictEqual(updater.compareVersions('v1.2.0', '1.2.0'), 0);
});

test('compareVersions 将预发布版本视为低于正式版', () => {
  assert.strictEqual(updater.compareVersions('1.2.0-beta.1', '1.2.0'), -1);
  assert.strictEqual(updater.compareVersions('1.2.0', '1.2.0-beta.1'), 1);
});

test('isNewer 仅在新版本更高时返回 true', () => {
  assert.strictEqual(updater.isNewer('1.1.1', '1.2.0'), true);
  assert.strictEqual(updater.isNewer('1.2.0', '1.2.0'), false);
  assert.strictEqual(updater.isNewer('1.3.0', '1.2.0'), false);
});

test('selectDmgAsset 优先选择 arm64 安装包', () => {
  const assets = [
    { name: 'OpenConnect VPN-1.2.0-x64.dmg', url: 'x64' },
    { name: 'OpenConnect VPN-1.2.0-arm64.dmg', url: 'arm64' },
    { name: 'latest-mac.yml', url: 'yml' }
  ];
  assert.strictEqual(updater.selectDmgAsset(assets).url, 'arm64');
  assert.strictEqual(updater.selectDmgAsset([{ name: 'OpenConnect VPN-1.2.0.dmg', url: 'any' }]).url, 'any');
  assert.strictEqual(updater.selectDmgAsset([{ name: 'latest-mac.yml', url: 'yml' }]), null);
  assert.strictEqual(updater.selectDmgAsset(null), null);
});

test('normalizeRelease 提取版本、下载地址与说明', () => {
  const release = updater.normalizeRelease({
    tag_name: 'v1.2.0',
    name: 'v1.2.0',
    body: '更新说明',
    html_url: 'https://github.com/hkproto1/openconnect-gui/releases/tag/v1.2.0',
    published_at: '2026-11-24T00:00:00Z',
    assets: [
      { name: 'OpenConnect VPN-1.2.0-arm64.dmg', browser_download_url: 'https://example.com/a.dmg', size: 100 }
    ]
  });
  assert.strictEqual(release.version, '1.2.0');
  assert.strictEqual(release.notes, '更新说明');
  assert.strictEqual(release.dmg.url, 'https://example.com/a.dmg');
});

test('checkForUpdate 根据最新版本判断是否需要更新', async () => {
  const release = {
    version: '1.2.0',
    url: 'https://github.com/hkproto1/openconnect-gui/releases/tag/v1.2.0',
    dmg: { name: 'OpenConnect VPN-1.2.0-arm64.dmg', url: 'https://example.com/a.dmg' },
    notes: '说明'
  };

  const available = await updater.checkForUpdate('1.1.1', { release });
  assert.strictEqual(available.updateAvailable, true);
  assert.strictEqual(available.latestVersion, '1.2.0');
  assert.strictEqual(available.downloadUrl, 'https://example.com/a.dmg');

  const upToDate = await updater.checkForUpdate('1.2.0', { release });
  assert.strictEqual(upToDate.updateAvailable, false);
});
