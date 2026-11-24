import { useMemo } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollText, ExternalLink, Info } from 'lucide-react';
import { LEVEL_META, parseLogEntry } from '../lib/log-utils';

const ROW_STYLES = {
  error: { border: 'border-l-red-500', label: 'text-red-600 dark:text-red-400' },
  warn: { border: 'border-l-amber-500', label: 'text-amber-600 dark:text-amber-400' },
  success: { border: 'border-l-emerald-500', label: 'text-emerald-600 dark:text-emerald-400' },
  step: { border: 'border-l-sky-500', label: 'text-sky-600 dark:text-sky-400' },
  route: { border: 'border-l-fuchsia-500', label: 'text-fuchsia-600 dark:text-fuchsia-400' },
  network: { border: 'border-l-cyan-500', label: 'text-cyan-600 dark:text-cyan-400' },
  diagnosis: { border: 'border-l-orange-500', label: 'text-orange-600 dark:text-orange-400' },
  hint: { border: 'border-l-teal-500', label: 'text-teal-600 dark:text-teal-400' },
  debug: { border: 'border-l-slate-400', label: 'text-slate-500 dark:text-slate-400' },
  info: { border: 'border-l-slate-400', label: 'text-slate-500 dark:text-slate-400' }
};

function BasicLogs({ logs, onViewAllLogs }) {
  // Show only the last 10 logs
  const recentLogs = useMemo(
    () => logs.slice(-10).map((log, index) => parseLogEntry(log, index)),
    [logs]
  );

  const errorCount = recentLogs.filter((entry) => entry.level === 'error').length;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            <CardTitle>最近活动</CardTitle>
            {errorCount > 0 && (
              <Badge variant="destructive" className="font-normal">{errorCount} 个错误</Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onViewAllLogs}>
            <ExternalLink className="h-4 w-4 mr-2" />
            查看全部日志
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 gap-3">
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            显示最近 10 条事件，按级别着色。连接失败时优先查看「诊断」「原因」「建议」行。
          </p>
        </div>

        {recentLogs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ScrollText className="h-8 w-8 opacity-50" />
            <p className="text-sm">暂无活动记录</p>
          </div>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {recentLogs.map((entry) => {
              const styles = ROW_STYLES[entry.level] || ROW_STYLES.info;
              return (
                <div
                  key={entry.id}
                  className={`rounded-md border border-l-2 bg-muted/40 px-3 py-2 ${styles.border}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${styles.label}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_META[entry.level].dot}`} />
                      {entry.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {entry.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm leading-snug">{entry.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BasicLogs;
