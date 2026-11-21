import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ScrollText, ExternalLink, Info } from 'lucide-react';

function BasicLogs({ logs, onViewAllLogs }) {
  // Show only the last 10 logs
  const recentLogs = logs.slice(-10);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            <CardTitle>最近活动</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={onViewAllLogs}>
            <ExternalLink className="h-4 w-4 mr-2" />
            查看全部日志
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        {recentLogs.length === 0 ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>最近活动</strong>显示最近的 10 条连接事件，可在这里查看连接尝试、认证状态和错误信息。点击「查看全部日志」获取完整历史。
                </p>
              </div>
            </div>
            <div className="text-center py-6 text-muted-foreground flex-1 flex flex-col items-center justify-center">
              <ScrollText className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">暂无活动记录</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>最近活动</strong>显示最近的 10 条连接事件，可在这里查看连接尝试、认证状态和错误信息。点击「查看全部日志」获取完整历史。
                </p>
              </div>
            </div>
            <div className="space-y-1 flex-1 overflow-y-auto">
              {recentLogs.map((log, index) => (
                <div
                  key={index}
                  className={`text-sm p-2 rounded ${
                    log.type === 'error'
                      ? 'bg-destructive/10 text-destructive'
                      : log.type === 'success'
                      ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="text-xs opacity-70">[{log.timestamp}]</span>{' '}
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BasicLogs;
