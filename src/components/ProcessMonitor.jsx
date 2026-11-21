import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ListChecks, RefreshCw, AlertCircle, Info, XCircle } from 'lucide-react';
import KillProcessModal from './KillProcessModal';

function ProcessMonitor({ onProcessCountChange }) {
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processToKill, setProcessToKill] = useState(null);

  useEffect(() => {
    checkProcesses();
  }, []);

  const checkProcesses = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.checkRunningProcesses();

      if (result.success) {
        setProcesses(result.processes || []);
        if (onProcessCountChange) {
          onProcessCountChange(result.count || 0);
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const extractPID = (processString) => {
    // Process string format: USER PID CPU MEM ... COMMAND
    const parts = processString.trim().split(/\s+/);
    return parts[1]; // PID is the second field
  };

  const handleKillProcess = (processString) => {
    setProcessToKill(processString);
  };

  const confirmKillProcess = async (password) => {
    if (!processToKill) return null;

    const pid = extractPID(processToKill);

    const result = await window.electronAPI.killProcess(pid, password);

    if (result.success) {
      // Success - refresh process list and close modal
      checkProcesses();
      setProcessToKill(null);
      return { success: true };
    } else if (result.incorrectPassword) {
      return { success: false, error: '密码错误，请重试。' };
    } else {
      setProcessToKill(null);
      setError(result.error);
      return { success: false, error: result.error };
    }
  };

  const cancelKillProcess = () => {
    setProcessToKill(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            <CardTitle>运行中的 OpenConnect 进程</CardTitle>
            {processes.length > 0 && (
              <Badge variant="default" className="ml-2">
                {processes.length} 个运行中
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={checkProcesses} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Informational Section */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">关于进程监控</h3>
          </div>
          <div className="text-xs text-blue-800 dark:text-blue-200 space-y-2">
            <p>
              该工具会扫描系统中正在运行的 OpenConnect VPN 进程，包括不是由本应用启动的进程。
            </p>
            <div className="mt-2">
              <p className="font-medium mb-1">可查看的内容：</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>系统中所有活动的 OpenConnect 进程</li>
                <li>通过终端或其他工具手动启动的进程</li>
                <li>由本应用管理的连接（运行中时）</li>
              </ul>
            </div>
            <p className="mt-2">
              <strong>说明：</strong>如果这里出现进程但你并未通过本应用连接，它们多半是手动启动或其他应用启动的。请通过「连接」页签管理本应用的 VPN 连接。
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && processes.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <ListChecks className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">未发现运行中的 OpenConnect 进程</p>
            <p className="text-xs mt-1">活动的 VPN 连接会显示在这里</p>
          </div>
        )}

        {processes.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              发现 {processes.length} 个运行中的 OpenConnect 进程：
            </div>
            {processes.map((process, idx) => (
              <div key={idx} className="bg-muted p-3 rounded font-mono text-xs flex items-start gap-3">
                <div className="flex-1 break-all">{process}</div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleKillProcess(process)}
                  className="flex-shrink-0"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  结束进程
                </Button>
              </div>
            ))}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>说明：</strong>这些进程独立运行。请通过「连接」页签管理本应用的 VPN 连接。
              </p>
            </div>
          </div>
        )}
      </CardContent>
      <KillProcessModal
        process={processToKill}
        onConfirm={confirmKillProcess}
        onCancel={cancelKillProcess}
      />
    </Card>
  );
}

export default ProcessMonitor;
