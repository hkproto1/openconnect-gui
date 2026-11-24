const https = require('https');
const fs = require('fs');

const DEFAULT_REPO = 'hkproto1/openconnect-gui';
const USER_AGENT = 'openconnect-gui-updater';

// 解析版本号为数值段与预发布标识，用于比较
function normalizeVersion(version) {
  const value = String(version || '').trim().replace(/^v/i, '');
  const [main, ...rest] = value.split('-');
  const parts = main.split('.').map((item) => parseInt(item, 10) || 0);
  return {
    parts: [parts[0] || 0, parts[1] || 0, parts[2] || 0],
    pre: rest.join('-')
  };
}

// 返回 1 表示 a 比 b 新，-1 表示旧，0 表示相同
function compareVersions(a, b) {
  const left = normalizeVersion(a);
  const right = normalizeVersion(b);

  for (let i = 0; i < 3; i++) {
    if (left.parts[i] > right.parts[i]) return 1;
    if (left.parts[i] < right.parts[i]) return -1;
  }

  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre < right.pre ? -1 : 1;
}

function isNewer(currentVersion, latestVersion) {
  return compareVersions(latestVersion, currentVersion) > 0;
}

// 优先选择 arm64 的 dmg，其次任意 dmg
function selectDmgAsset(assets) {
  const list = assets || [];
  return list.find((asset) => /\.dmg$/i.test(asset.name) && /arm64/i.test(asset.name))
    || list.find((asset) => /\.dmg$/i.test(asset.name))
    || null;
}

function normalizeRelease(json) {
  const assets = (json.assets || []).map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size || 0
  }));
  const version = String(json.tag_name || '').trim().replace(/^v/i, '');
  return {
    tag: json.tag_name || '',
    version,
    name: json.name || '',
    notes: json.body || '',
    url: json.html_url || '',
    publishedAt: json.published_at || '',
    assets,
    dmg: selectDmgAsset(assets)
  };
}

function fetchLatestRelease(options = {}) {
  const repo = options.repo || DEFAULT_REPO;
  const timeout = options.timeout || 15000;

  return new Promise((resolve, reject) => {
    const request = https.get({
      hostname: 'api.github.com',
      path: `/repos/${repo}/releases/latest`,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json'
      }
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`检查更新失败：GitHub API 返回 ${response.statusCode}`));
          return;
        }
        try {
          resolve(normalizeRelease(JSON.parse(body)));
        } catch {
          reject(new Error('检查更新失败：无法解析 GitHub 响应'));
        }
      });
    });

    request.setTimeout(timeout, () => {
      request.destroy(new Error('检查更新超时，请稍后重试'));
    });
    request.on('error', reject);
  });
}

async function checkForUpdate(currentVersion, options = {}) {
  const release = options.release || await fetchLatestRelease(options);
  const latestVersion = release.version || '';

  return {
    currentVersion,
    latestVersion,
    updateAvailable: Boolean(latestVersion) && isNewer(currentVersion, latestVersion),
    releaseUrl: release.url || '',
    downloadUrl: release.dmg ? release.dmg.url : (release.url || ''),
    downloadName: release.dmg ? release.dmg.name : '',
    notes: release.notes || '',
    name: release.name || release.tag || ''
  };
}

// 下载更新包（跟随重定向），用于下载完成后自动打开 dmg
function downloadFile(url, destPath, options = {}) {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeout = options.timeout || 300000;
  const onProgress = options.onProgress;

  return new Promise((resolve, reject) => {
    let currentRequest = null;
    let file = null;
    let settled = false;

    const timer = setTimeout(() => {
      if (currentRequest) currentRequest.destroy();
      if (file) file.destroy();
      finish(new Error('下载更新超时'));
    }, timeout);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    }

    const request = (target, redirectsLeft) => {
      currentRequest = https.get(target, {
        headers: { 'User-Agent': USER_AGENT }
      }, (response) => {
        const status = response.statusCode;

        if (status >= 300 && status < 400 && response.headers.location && redirectsLeft > 0) {
          response.resume();
          request(new URL(response.headers.location, target).toString(), redirectsLeft - 1);
          return;
        }

        if (status !== 200) {
          response.resume();
          finish(new Error(`下载更新失败：HTTP ${status}`));
          return;
        }

        const total = parseInt(response.headers['content-length'] || '0', 10);
        let received = 0;
        file = fs.createWriteStream(destPath, { mode: 0o644 });

        response.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) {
            onProgress(received, total);
          }
        });
        response.on('error', finish);
        file.on('error', finish);
        file.on('finish', () => {
          file.close(() => finish(null, { path: destPath, size: received }));
        });

        response.pipe(file);
      });
      currentRequest.on('error', finish);
    };

    request(url, maxRedirects);
  });
}

module.exports = {
  DEFAULT_REPO,
  compareVersions,
  isNewer,
  selectDmgAsset,
  normalizeRelease,
  fetchLatestRelease,
  checkForUpdate,
  downloadFile
};
