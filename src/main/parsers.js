// Pure parsers for macOS network command output.
// Kept free of Electron/Node APIs so they can be unit tested.

// Parse `netstat -rn` output, returning IPv4 routes only.
function parseRoutes(stdout) {
  const lines = String(stdout).split('\n');
  const routes = [];
  let inInternetSection = false;

  for (const line of lines) {
    if (line.includes('Internet:')) {
      inInternetSection = true;
      continue;
    }
    if (line.includes('Internet6:')) {
      inInternetSection = false;
      break;
    }
    if (inInternetSection && line.trim() && !line.includes('Destination')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        routes.push({
          destination: parts[0],
          gateway: parts[1],
          flags: parts[2],
          interface: parts[3]
        });
      }
    }
  }

  return routes;
}

// Parse `ifconfig` output into name/status/ip entries.
function parseNetworkInterfaces(stdout) {
  const interfaces = [];
  const sections = String(stdout).split(/\n(?=[a-z])/);

  for (const section of sections) {
    const firstLine = section.split('\n')[0];
    if (!firstLine) continue;

    const nameMatch = firstLine.match(/^([a-z0-9]+):/);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    const statusMatch = section.match(/status: (\w+)/);
    const inetMatch = section.match(/inet (\d+\.\d+\.\d+\.\d+)/);

    if (inetMatch || statusMatch) {
      interfaces.push({
        name,
        status: statusMatch ? statusMatch[1] : 'unknown',
        ip: inetMatch ? inetMatch[1] : null
      });
    }
  }

  return interfaces;
}

module.exports = { parseRoutes, parseNetworkInterfaces };
