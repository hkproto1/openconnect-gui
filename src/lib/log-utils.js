const TAG_LEVELS = {
  错误: 'error',
  警告: 'warn',
  成功: 'success',
  步骤: 'step',
  路由: 'route',
  网络: 'network',
  诊断: 'diagnosis',
  建议: 'hint',
  提示: 'hint',
  调试: 'debug',
  信息: 'info'
};

export const LEVEL_META = {
  error: { label: '错误', dot: 'bg-red-500' },
  warn: { label: '警告', dot: 'bg-amber-500' },
  success: { label: '成功', dot: 'bg-emerald-500' },
  step: { label: '步骤', dot: 'bg-sky-500' },
  route: { label: '路由', dot: 'bg-fuchsia-500' },
  network: { label: '网络', dot: 'bg-cyan-500' },
  diagnosis: { label: '诊断', dot: 'bg-orange-500' },
  hint: { label: '建议', dot: 'bg-teal-500' },
  debug: { label: '调试', dot: 'bg-slate-400' },
  info: { label: '信息', dot: 'bg-slate-400' }
};

export const FLOW_LEVELS = ['step', 'route', 'network', 'diagnosis', 'hint', 'debug'];

const TAG_PATTERN = /^\[(错误|警告|成功|步骤|路由|网络|诊断|建议|提示|调试|信息)\]\s*/;

function inferLevelFromText(message) {
  if (/error|failed|failure|refused|unreachable|no route|can't|cannot|timed out|denied|incorrect/i.test(message)) {
    return 'error';
  }
  if (/warning|warn/i.test(message)) return 'warn';
  if (/connected|established|configured as/i.test(message)) return 'success';
  return null;
}

// 把日志统一解析为「级别 + 去掉标签前缀的正文 + 时间」
export function parseLogEntry(log, index = 0) {
  const raw = String(log?.message ?? '');
  const tagMatch = raw.match(TAG_PATTERN);
  let level = tagMatch ? TAG_LEVELS[tagMatch[1]] : null;

  if (!level) {
    if (log?.type === 'error') level = 'error';
    else if (log?.type === 'success') level = 'success';
    else if (log?.type === 'warn') level = 'warn';
    else if (log?.type === 'step') level = 'step';
    else if (log?.type === 'debug') level = 'debug';
    else level = inferLevelFromText(raw) || 'info';
  }

  return {
    id: `${log?.timestamp || 'log'}-${index}`,
    level,
    label: LEVEL_META[level].label,
    text: tagMatch ? raw.slice(tagMatch[0].length) : raw,
    timestamp: log?.timestamp || ''
  };
}

export function summarizeLogs(logs) {
  const counts = { total: logs.length, error: 0, warn: 0 };
  for (const log of logs) {
    const entry = parseLogEntry(log);
    if (entry.level === 'error') counts.error++;
    else if (entry.level === 'warn') counts.warn++;
  }
  return counts;
}
