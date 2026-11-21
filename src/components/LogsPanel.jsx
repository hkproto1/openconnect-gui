import { useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Info, ScrollText } from 'lucide-react';

function LogsPanel({ logs, clearLogs }) {
  const logsContainerRef = useRef(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const copyLogs = () => {
    const logsText = logs.map(log => `[${log.timestamp}] ${log.message}`).join('\n');
    navigator.clipboard.writeText(logsText).then(() => {
      // Optional: show a brief success message
      console.log('日志已复制到剪贴板');
    }).catch(err => {
      console.error('复制日志失败：', err);
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          <CardTitle>连接日志</CardTitle>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLogs} disabled={logs.length === 0}>
            复制
          </Button>
          <Button variant="outline" size="sm" onClick={clearLogs}>
            清空
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Informational Section */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">关于连接日志</h3>
          </div>
          <div className="text-xs text-blue-800 dark:text-blue-200 space-y-2">
            <p>
              这里记录所有 VPN 连接事件，包括认证尝试、连接状态变化和错误信息。
            </p>
            <div className="mt-2">
              <p className="font-medium mb-1">使用说明：</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>查看详细的连接流程与耗时信息</li>
                <li>定位认证失败或网络错误</li>
                <li>复制日志以便反馈问题或排查故障</li>
                <li>需要时清空日志，重新开始记录</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="h-[450px] overflow-y-auto rounded-md border bg-muted/50 p-4 font-mono text-sm" ref={logsContainerRef}>
          {logs.length === 0 ? (
            <div className="flex gap-2 text-muted-foreground">
              <span className="font-semibold">就绪</span>
              <span>填写连接信息后点击「连接」</span>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-muted-foreground">[{log.timestamp}]</span>
                  <span className={log.type === 'error' ? 'text-destructive' : log.type === 'success' ? 'font-semibold' : ''}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default LogsPanel;
