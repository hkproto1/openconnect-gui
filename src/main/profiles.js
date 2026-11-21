const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const FILE_VERSION = 2;
const PUBLIC_FIELDS = ['name', 'server', 'username', 'authgroup', 'protocol', 'serverCert'];

// Whether the OS keychain is available for encrypting secrets
function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptSecret(value) {
  if (!value) return '';
  return safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(encoded) {
  if (!encoded) return '';
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch {
    // Keychain entry missing or bound to another user/machine
    return '';
  }
}

// Convert a stored record into the shape the renderer expects
function toMemoryProfile(item, encryptedOnDisk) {
  const profile = {};
  for (const field of PUBLIC_FIELDS) {
    profile[field] = typeof item[field] === 'string' ? item[field] : '';
  }
  profile.protocol = profile.protocol || 'anyconnect';

  if (encryptedOnDisk && item.passwordEnc) {
    profile.password = decryptSecret(item.passwordEnc);
  } else {
    profile.password = typeof item.password === 'string' ? item.password : '';
  }
  return profile;
}

// Write profiles atomically, encrypting passwords with the OS keychain when available
function saveProfiles(filePath, profiles) {
  try {
    const canEncrypt = isEncryptionAvailable();
    const payload = {
      version: FILE_VERSION,
      encryption: canEncrypt ? 'safeStorage' : 'plaintext',
      profiles: (profiles || []).map((profile) => {
        const record = {};
        for (const field of PUBLIC_FIELDS) {
          record[field] = typeof profile[field] === 'string' ? profile[field] : '';
        }
        record.protocol = record.protocol || 'anyconnect';

        if (canEncrypt) {
          record.passwordEnc = encryptSecret(typeof profile.password === 'string' ? profile.password : '');
        } else {
          record.password = typeof profile.password === 'string' ? profile.password : '';
        }
        return record;
      })
    };

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Best effort on filesystems without POSIX permissions
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Read profiles, transparently migrating the legacy plaintext format (v1)
function loadProfiles(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: true, profiles: [] };
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const isLegacyArray = Array.isArray(data);
    const items = isLegacyArray ? data : data && Array.isArray(data.profiles) ? data.profiles : [];

    if (!Array.isArray(items)) {
      return { success: false, error: '配置文件格式无效' };
    }

    const profiles = items.map((item) => toMemoryProfile(item, !isLegacyArray));

    // v1 files are an array; v2 files may still contain plaintext passwords
    // when they were written before encryption was available.
    const hasPlaintextOnDisk = items.some(
      (item) => item.passwordEnc === undefined && typeof item.password === 'string' && item.password
    );
    if (isLegacyArray || (hasPlaintextOnDisk && isEncryptionAvailable())) {
      saveProfiles(filePath, profiles);
    }

    return { success: true, profiles };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { loadProfiles, saveProfiles, FILE_VERSION };
