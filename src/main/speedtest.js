const https = require('https');
const crypto = require('crypto');

const SPEED_TEST_HOST = 'speed.cloudflare.com';
const SPEED_TEST_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const SPEED_TEST_UPLOAD_BYTES = 1 * 1024 * 1024;

function measureLatency(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let settled = false;
    let timer = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const request = https.get({
      hostname: SPEED_TEST_HOST,
      path: '/__down?bytes=0',
      headers: {
        'User-Agent': 'openconnect-gui-speedtest',
        Accept: '*/*'
      }
    }, (response) => {
      finish(null, { latencyMs: Date.now() - startedAt, statusCode: response.statusCode });
      response.destroy();
    });

    request.on('error', (error) => finish(error));
    request.setTimeout(timeout, () => {
      request.destroy();
      finish(new Error('延迟测试超时'));
    });
    timer = setTimeout(() => {
      request.destroy();
      finish(new Error('延迟测试超时'));
    }, timeout);
  });
}

function measureDownloadSpeed(totalBytes, onProgress, timeout = 40000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let firstByteAt = null;
    let received = 0;
    let settled = false;
    let timer = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const request = https.get({
      hostname: SPEED_TEST_HOST,
      path: `/__down?bytes=${totalBytes}`,
      headers: {
        'User-Agent': 'openconnect-gui-speedtest',
        Accept: '*/*'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        finish(new Error(`测速服务器返回 HTTP ${response.statusCode}`));
        return;
      }

      response.on('data', (chunk) => {
        if (!firstByteAt) firstByteAt = Date.now();
        received += chunk.length;
        if (onProgress) {
          onProgress({ phase: 'download', received, total: totalBytes });
        }
      });
      response.on('end', () => {
        const seconds = (Date.now() - (firstByteAt || startedAt)) / 1000;
        finish(null, { bytes: received, seconds, partial: false });
      });
      response.on('error', (error) => finish(error));
    });

    request.on('error', (error) => {
      if (received > 0) {
        const seconds = (Date.now() - (firstByteAt || startedAt)) / 1000;
        finish(null, { bytes: received, seconds, partial: true });
      } else {
        finish(error);
      }
    });

    timer = setTimeout(() => {
      request.destroy();
      if (received > 0) {
        const seconds = (Date.now() - (firstByteAt || startedAt)) / 1000;
        finish(null, { bytes: received, seconds, partial: true });
      } else {
        finish(new Error('下载测速超时'));
      }
    }, timeout);
  });
}

function measureUploadSpeed(totalBytes, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const payload = crypto.randomBytes(totalBytes);
    const startedAt = Date.now();
    let settled = false;
    let timer = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const request = https.request({
      hostname: SPEED_TEST_HOST,
      path: '/__up',
      method: 'POST',
      headers: {
        'User-Agent': 'openconnect-gui-speedtest',
        'Content-Type': 'application/octet-stream',
        'Content-Length': totalBytes
      }
    }, (response) => {
      response.resume();
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          finish(new Error(`上传测速返回 HTTP ${response.statusCode}`));
          return;
        }
        finish(null, { bytes: totalBytes, seconds: (Date.now() - startedAt) / 1000 });
      });
      response.on('error', (error) => finish(error));
    });

    request.on('error', (error) => finish(error));
    timer = setTimeout(() => {
      request.destroy();
      finish(new Error('上传测速超时'));
    }, timeout);
    request.end(payload);
  });
}

module.exports = {
  SPEED_TEST_HOST,
  SPEED_TEST_DOWNLOAD_BYTES,
  SPEED_TEST_UPLOAD_BYTES,
  measureLatency,
  measureDownloadSpeed,
  measureUploadSpeed
};
