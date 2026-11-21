import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { AlertTriangle, RefreshCw, Trash2, Network, CheckCircle2, XCircle, Info } from 'lucide-react';
import RouteDeleteModal from './RouteDeleteModal';

function DiagnosticsPanel({ showAlert, addLog, serverUrl, onProblematicRoutesChange, isActive }) {
  const [routes, setRoutes] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [connectivity, setConnectivity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (isActive && !hasLoaded) {
      refreshDiagnostics();
      setHasLoaded(true);
    }
  }, [isActive, hasLoaded]);

  const refreshDiagnostics = async () => {
    setLoading(true);

    try {
      // Get routes
      const routesResult = await window.electronAPI.getRoutes();
      if (routesResult.success) {
        const routesList = routesResult.routes || [];
        setRoutes(routesList);
      } else {
        addLog(`获取路由表失败：${routesResult.error}`, 'error');
      }

      // Get network interfaces
      const interfacesResult = await window.electronAPI.getNetworkInterfaces();
      if (interfacesResult.success) {
        setInterfaces(interfacesResult.interfaces || []);
      }

      // Test connectivity if server URL is provided
      if (serverUrl) {
        const host = extractHost(serverUrl);
        const port = extractPort(serverUrl);
        if (host) {
          const connResult = await window.electronAPI.testConnectivity(host, port);
          setConnectivity(connResult);
        }
      }
    } catch (error) {
      addLog(`诊断出错：${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const extractHost = (url) => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url.split(':')[0];
    }
  };

  const extractPort = (url) => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      const urlObj = new URL(url);
      return urlObj.port || 443;
    } catch {
      const parts = url.split(':');
      return parts[1] ? parseInt(parts[1]) : 443;
    }
  };

  const isProblematicRoute = (route) => {
    // Check if gateway looks unreachable
    const gateway = route.gateway;

    // Skip default and special routes
    if (route.destination === 'default' || route.gateway === 'link#' || gateway.startsWith('link#')) {
      return false;
    }

    // Check if gateway is in a private range that might be from old network
    const currentIPs = interfaces.map(i => i.ip).filter(Boolean);

    // If gateway is a private IP but not in current network subnets
    if (gateway.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/)) {
      const isInCurrentNetwork = currentIPs.some(ip => {
        const currentSubnet = ip.split('.').slice(0, 3).join('.');
        const gatewaySubnet = gateway.split('.').slice(0, 3).join('.');
        return currentSubnet === gatewaySubnet;
      });

      if (!isInCurrentNetwork) {
        return true;
      }
    }

    return false;
  };

  const handleDeleteRoute = (route) => {
    setRouteToDelete(route);
  };

  const confirmDeleteRoute = async (password) => {
    if (!routeToDelete) return null;

    const destination = routeToDelete.destination;
    addLog(`正在尝试删除到 ${destination} 的路由…`, 'info');

    const result = await window.electronAPI.deleteRoute(destination, password);

    if (result.success) {
      showAlert(`路由删除成功`, 'success');
      addLog(`已删除到 ${destination} 的路由`, 'info');
      refreshDiagnostics();
      setRouteToDelete(null);
      return { success: true };
    } else if (result.incorrectPassword) {
      addLog(`sudo 密码错误`, 'error');
      return { success: false, error: '密码错误，请重试。' };
    } else {
      showAlert(`删除路由失败：${result.error}`, 'error');
      addLog(`删除路由失败：${result.error}`, 'error');
      setRouteToDelete(null);
      return { success: false, error: result.error };
    }
  };

  const cancelDeleteRoute = () => {
    setRouteToDelete(null);
  };

  const problematicRoutes = routes.filter(isProblematicRoute);

  // Notify parent of problematic routes count
  useEffect(() => {
    if (onProblematicRoutesChange) {
      onProblematicRoutesChange(problematicRoutes.length);
    }
  }, [problematicRoutes.length, onProblematicRoutesChange]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              <CardTitle>网络诊断</CardTitle>
              {problematicRoutes.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {problematicRoutes.length} 个问题
                </Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={refreshDiagnostics} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </CardHeader>
      <CardContent className="space-y-6">
        {/* Informational Section */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">关于网络诊断</h3>
          </div>
          <div className="text-xs text-blue-800 dark:text-blue-200 space-y-2">
            <p>
              该工具用于诊断并修复可能影响 VPN 连接的网络问题，帮助你了解系统当前的网络配置。
            </p>
            <div className="mt-3">
              <p className="font-medium mb-1">重点关注：</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>异常路由：</strong>指向不可达网关的残留路由（通常来自之前连接过的网络或 VPN）</li>
                <li><strong>连通性测试：</strong>检查当前网络能否访问 VPN 服务器</li>
                <li><strong>网络接口：</strong>查看活动网络接口及其 IP 地址</li>
              </ul>
            </div>
            <p className="mt-3">
              <strong>常见问题：</strong>如果看到网关类似 <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">172.20.10.1</code> 的路由，而你已经不在该网络下，
              它很可能正在阻塞 VPN 连接，点击<strong>删除</strong>即可移除。
            </p>
          </div>
        </div>
        {/* Connectivity Test */}
        {connectivity && (
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              {connectivity.reachable ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              VPN 服务器连通性
            </h3>
            <div className="text-sm bg-muted p-3 rounded">
              <div><span className="font-medium">主机：</span> {connectivity.host}:{connectivity.port}</div>
              <div><span className="font-medium">状态：</span> {connectivity.reachable ? '可达 ✓' : '不可达 ✗'}</div>
              {connectivity.message && (
                <div className="mt-2 text-xs text-muted-foreground">{connectivity.message}</div>
              )}
            </div>
          </div>
        )}

        {/* Network Interfaces */}
        <div>
          <h3 className="font-semibold mb-2">活动网络接口</h3>
          <div className="space-y-2">
            {interfaces.filter(i => i.ip).map((iface) => (
              <div key={iface.name} className="text-sm bg-muted p-2 rounded flex justify-between items-center">
                <div>
                  <span className="font-mono font-semibold">{iface.name}</span>
                  <span className="mx-2">→</span>
                  <span className="font-mono">{iface.ip}</span>
                </div>
                <Badge variant={iface.status === 'active' ? 'default' : 'outline'} className="text-xs">
                  {iface.status === 'active' ? '启用' : iface.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Problematic Routes */}
        {problematicRoutes.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              检测到异常路由
            </h3>
            <div className="space-y-2">
              {problematicRoutes.map((route, idx) => (
                <div key={idx} className="text-sm bg-destructive/10 border border-destructive/20 p-3 rounded">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-mono">
                        <span className="font-semibold">{route.destination}</span>
                        <span className="mx-2">→</span>
                        <span>{route.gateway}</span>
                        <span className="mx-2 text-muted-foreground">经由 {route.interface}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        该路由指向的网关在当前网络中可能不可达。
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteRoute(route)}
                      className="ml-4"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              <p>💡 <strong>提示：</strong>残留路由会阻塞 VPN 连接，删除异常路由可修复连通性问题。</p>
            </div>
          </div>
        )}

        {/* All Routes */}
        <div>
          <h3 className="font-semibold mb-2">全部路由（{routes.length}）</h3>
          <div className="max-h-64 overflow-y-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2 font-semibold">目标地址</th>
                  <th className="text-left p-2 font-semibold">网关</th>
                  <th className="text-left p-2 font-semibold">标志</th>
                  <th className="text-left p-2 font-semibold">网络接口</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {routes.map((route, idx) => (
                  <tr key={idx} className={`border-t ${isProblematicRoute(route) ? 'bg-destructive/5' : ''}`}>
                    <td className="p-2">{route.destination}</td>
                    <td className="p-2">{route.gateway}</td>
                    <td className="p-2 text-muted-foreground">{route.flags}</td>
                    <td className="p-2">{route.interface}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
      </Card>

      {/* Delete Route Confirmation Modal */}
      <RouteDeleteModal
        route={routeToDelete}
        onConfirm={confirmDeleteRoute}
        onCancel={cancelDeleteRoute}
      />
    </>
  );
}

export default DiagnosticsPanel;
