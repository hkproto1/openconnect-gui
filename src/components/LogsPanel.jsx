import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Info, ScrollText, Copy, Trash2, Check, ArrowDown } from 'lucide-react';
import { FLOW_LEVELS, parseLogEntry, summarizeLogs } from '../lib/log-utils';

const CONSOLE_TEXT_STYLES = {
  error: 'text-red-400',
  warn: 'text-amber-300',
  success: 'text-emerald-400',
  step: 'text-sky-400',
  route: 'text-fuchsia-300',
  network: 'text-cyan-300',
  diagnosis: 'text-orange-300',
  hint: 'text-teal-300',
  debug: 'text-zinc-400',
  info: 'text-zinc-300'
};

const CONSOLE_CHIP_STYLES = {
  error: 'border-red-500/30 bg-red-500/15 text-red-300',
  warn: 'border-amber-500/30 bg-amber-500/15 text-amber-200',
  success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  step: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
  route: 'border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-200',
  network: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200',
  diagnosis: 'border-orange-500/30 bg-orange-500/15 text-orange-200',
  hint: 'border-teal-500/30 bg-teal-500/15 text-teal-200',
  debug: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-300',
  info: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-300'
};

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'error', label: '错误' },
  { id: 'warn', label: '警告' },
  { id: 'flow', label: '流程' }
];

function LogsPanel({ logs, clearLogs }) {
  const logsContainerRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);

  const parsedLogs = useMemo(
    () => logs.map((log, index) => parseLogEntry(log, index)),
    [logs]
  );

  const summary = useMemo(() => summarizeLogs(logs), [logs]);

  const counts = useMemo(() => ({
    all: parsedLogs.length,
    error: parsedLogs.filter((entry) => entry.level === 'error').length,
    warn: parsedLogs.filter((entry) => entry.level === 'warn').length,
    flow: parsedLogs.filter((entry) => FLOW_LEVELS.includes(entry.level)).length
  }), [parsedLogs]);

  const visibleLogs = useMemo(() => {
    if (filter === 'error') return parsedLogs.filter((entry) => entry.level === 'error');
    if (filter === 'warn') return parsedLogs.filter((entry) => entry.level === 'warn');
    if (filter === 'flow') return parsedLogs.filter((entry) => FLOW_LEVELS.includes(entry.level));
    return parsedLogs;
  }, [parsedLogs, filter]);

  const scrollToBottom = () => {
    const container = logsContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  useEffect(() => {
    if (stickToBottom) {
      scrollToBottom();
    }
  }, [visibleLogs, stickToBottom]);

  const handleScroll = () => {
    const container = logsContainerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setStickToBottom(distanceToBottom < 48);
  };

  const copyLogs = async () => {
    if (parsedLogs.length === 0) return;
    const text = parsedLogs
      .map((entry) => `[${entry.timestamp}] [${entry.label}] ${entry.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制日志失败：', error);
    }
  };

  const handleClear = () => {
    clearLogs();
    setFilter('all');
    setStickToBottom(true);
  };

  const emptyText = parsedLogs.length === 0
    ? '暂无日志。填写连接信息后点击「连接」开始记录。'
    : '当前筛选条件下没有日志。';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          <CardTitle>连接日志</CardTitle>
          <Badge variant="secondary" className="font-normal">{summary.total} 条</Badge>
          {summary.error > 0 && (
            <Badge variant="destructive" className="font-normal">{summary.error} 个错误</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLogs} disabled={parsedLogs.length === 0}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? '已复制' : '复制'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="mr-2 h-4 w-4" />
            清空
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            日志按级别自动着色。连接失败时优先查看「诊断」「原因」「建议」行；出现残留路由时会给出具体网关与删除方法。
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                {item.label}
                <span className="ml-1.5 opacity-70">{counts[item.id]}</span>
              </button>
            );
          })}
        </div>

        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          className="h-[520px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[13px] leading-relaxed"
        >
          {visibleLogs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
              <ScrollText className="h-8 w-8 opacity-40" />
              <p className="text-xs">{emptyText}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {visibleLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2.5 rounded px-2 py-1 hover:bg-white/5"
                >
                  <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-zinc-500">
                    {entry.timestamp}
                  </span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-4 ${CONSOLE_CHIP_STYLES[entry.level]}`}
                  >
                    {entry.label}
                  </span>
                  <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${CONSOLE_TEXT_STYLES[entry.level]}`}>
                    {entry.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {!stickToBottom && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStickToBottom(true);
                scrollToBottom();
              }}
            >
              <ArrowDown className="mr-2 h-4 w-4" />
              回到底部
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LogsPanel;
