import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Gauge,
  Download,
  Upload,
  Timer,
  Play,
  Loader2,
  Wifi,
  ShieldCheck,
  Info,
  AlertCircle
} from 'lucide-react';

const MAX_SAMPLES = 60;
const HISTORY_MODES = [
  { id: 'direct', label: '直连' },
  { id: 'vpn', label: 'VPN 全隧道' },
  { id: 'split', label: 'VPN 分流' }
];

function formatRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return { value: '0', unit: 'B/s' };
  }
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bytesPerSecond;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return {
    value: value >= 100 ? value.toFixed(0) : value.toFixed(1),
    unit: units[index]
  };
}

function formatMbps(mbps) {
  if (!Number.isFinite(mbps)) return '—';
  if (mbps < 1) return `${Math.round(mbps * 1000)} kbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

function formatLatency(ms) {
  return Number.isFinite(ms) ? `${Math.round(ms)} ms` : '—';
}

function readHistory() {
  const history = {};
  for (const mode of HISTORY_MODES) {
    try {
      const raw = localStorage.getItem(`speedtest-${mode.id}`);
      if (raw) history[mode.id] = JSON.parse(raw);
    } catch {
      // 忽略损坏的本地记录
    }
  }
  return history;
}

function Sparkline({ values, colorClass }) {
  const series = useMemo(() => {
    const padded = [...Array(MAX_SAMPLES - values.length).fill(0), ...values];
    return padded.slice(-MAX_SAMPLES);
  }, [values]);

  const max = Math.max(1, ...series);
  const points = series
    .map((value, index) => {
      const x = (index / (MAX_SAMPLES - 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`h-12 w-full ${colorClass}`}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function RateCard({ title, icon: Icon, rate, samples, colorClass }) {
  const formatted = formatRate(rate);
  const peak = Math.max(0, ...samples);
  const peakFormatted = formatRate(peak);

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4" />
          {title}
        </div>
        <span className="text-[10px] text-muted-foreground">
          峰值 {peakFormatted.value} {peakFormatted.unit}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums">{formatted.value}</span>
        <span className="text-sm text-muted-foreground">{formatted.unit}</span>
      </div>
      <Sparkline values={samples} colorClass={colorClass} />
    </div>
  );
}

function NetworkSpeed({ isActive }) {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [rates, setRates] = useState({
    vpn: { down: 0, up: 0 },
    primary: { down: 0, up: 0 }
  });
  const [samples, setSamples] = useState({ vpnDown: [], vpnUp: [], primaryDown: [], primaryUp: [] });
  const [sessionTotals, setSessionTotals] = useState({ down: 0, up: 0 });
  const [speedTest, setSpeedTest] = useState({
    running: false,
    phase: null,
    result: null,
    error: ''
  });
  const [history, setHistory] = useState(readHistory);

  const previousRef = useRef(null);
  const sessionRef = useRef({ interfaceName: null, down: 0, up: 0 });

  const pushSample = (key, value) => {
    setSamples((prev) => {
      const next = [...prev[key], value];
      if (next.length > MAX_SAMPLES) next.shift();
      return { ...prev, [key]: next };
    });
  };

  const computeRates = useCallback((snapshot) => {
    const currentCounters = new Map(snapshot.interfaces.map((item) => [item.name, item]));
    const previous = previousRef.current;

    const rateFor = (interfaceName) => {
      if (!interfaceName) return { down: 0, up: 0 };
      const current = currentCounters.get(interfaceName);
      const before = previous ? previous.counters.get(interfaceName) : null;
      if (!current || !before) return { down: 0, up: 0 };

      const elapsed = (snapshot.timestamp - previous.timestamp) / 1000;
      if (elapsed <= 0) return { down: 0, up: 0 };

      const downDelta = Math.max(0, current.ibytes - before.ibytes);
      const upDelta = Math.max(0, current.obytes - before.obytes);
      return { down: downDelta / elapsed, up: upDelta / elapsed };
    };

    const vpnRate = rateFor(snapshot.vpnInterface);
    const primaryRate = rateFor(snapshot.primaryInterface);

    setRates({ vpn: vpnRate, primary: primaryRate });

    if (previous) {
      pushSample('vpnDown', vpnRate.down);
      pushSample('vpnUp', vpnRate.up);
      pushSample('primaryDown', primaryRate.down);
      pushSample('primaryUp', primaryRate.up);

      if (snapshot.vpnInterface) {
        if (sessionRef.current.interfaceName !== snapshot.vpnInterface) {
          sessionRef.current = { interfaceName: snapshot.vpnInterface, down: 0, up: 0 };
        }
        sessionRef.current.down += vpnRate.down;
        sessionRef.current.up += vpnRate.up;
        setSessionTotals({ down: sessionRef.current.down, up: sessionRef.current.up });
      }
    }

    previousRef.current = { timestamp: snapshot.timestamp, counters: currentCounters };
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;

    let cancelled = false;
    let timer = null;

    const tick = async () => {
      try {
        const snapshot = await window.electronAPI.getNetworkStats();
        if (cancelled) return;
        if (!snapshot.success) {
          setStatsError(snapshot.error || '读取网络速率失败');
          return;
        }
        setStatsError('');
        setStats(snapshot);
        computeRates(snapshot);
      } catch (error) {
        if (!cancelled) setStatsError(error.message);
      }
    };

    tick();
    timer = setInterval(tick, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      // 离开页面后重新采样时先建立新的基线，避免把离开期间的流量算成瞬时速率
      previousRef.current = null;
    };
  }, [isActive, computeRates]);

  useEffect(() => {
    if (typeof window.electronAPI.onSpeedTestProgress !== 'function') {
      return undefined;
    }
    const unsubscribe = window.electronAPI.onSpeedTestProgress((progress) => {
      setSpeedTest((prev) => ({ ...prev, phase: progress }));
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const isVpnActive = Boolean(stats && stats.connectionStatus === 'connected' && stats.vpnInterface);
  const currentMode = isVpnActive ? (stats.route?.mode || 'vpn') : 'direct';

  const handleSpeedTest = async () => {
    setSpeedTest({ running: true, phase: { phase: 'latency' }, result: null, error: '' });
    try {
      const result = await window.electronAPI.runSpeedTest();
      if (!result.success) {
        setSpeedTest({ running: false, phase: null, result: null, error: result.error || '测速失败' });
        return;
      }

      const saved = { ...result, savedAt: Date.now() };
      setSpeedTest({ running: false, phase: null, result: saved, error: '' });
      setHistory((prev) => ({ ...prev, [result.mode]: saved }));

      try {
        localStorage.setItem(`speedtest-${result.mode}`, JSON.stringify(saved));
      } catch {
        // 本地记录写入失败不影响本次结果展示
      }
    } catch (error) {
      setSpeedTest({ running: false, phase: null, result: null, error: error.message });
    }
  };

  const phaseText = useMemo(() => {
    const phase = speedTest.phase;
    if (!phase) return '';
    if (phase.phase === 'latency') return '测试国际节点延迟…';
    if (phase.phase === 'download') {
      const percent = phase.total ? Math.min(100, Math.round((phase.received / phase.total) * 100)) : 0;
      return `下载测速 ${percent}%`;
    }
    if (phase.phase === 'upload') return '上传测速…';
    return '';
  }, [speedTest.phase]);

  const primaryInterface = stats?.primaryInterface || '—';
  const vpnInterface = stats?.vpnInterface || null;
  const sessionDown = formatRate(sessionTotals.down);
  const sessionUp = formatRate(sessionTotals.up);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              <CardTitle>网速监控</CardTitle>
              <Badge variant={isVpnActive ? 'default' : 'outline'}>
                {stats?.connectionStatus === 'connecting'
                  ? '连接中'
                  : isVpnActive
                    ? 'VPN 已连接'
                    : '未连接 VPN'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wifi className="h-4 w-4" />
              每秒刷新
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              这里是接口级实时速率：VPN 隧道显示实际经过隧道的数据，物理网卡显示本机总收发。
              如需判断是本地带宽不足还是 VPN 慢，请分别在未连接和已连接状态各做一次测速。
            </span>
          </div>

          {statsError && (
            <p className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {statsError}
            </p>
          )}

          {isVpnActive ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <RateCard
                  title={`VPN 下载 · ${vpnInterface}`}
                  icon={Download}
                  rate={rates.vpn.down}
                  samples={samples.vpnDown}
                  colorClass="text-emerald-500"
                />
                <RateCard
                  title={`VPN 上传 · ${vpnInterface}`}
                  icon={Upload}
                  rate={rates.vpn.up}
                  samples={samples.vpnUp}
                  colorClass="text-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border px-4 py-3">
                  <p className="text-xs text-muted-foreground">物理网卡下载 · {primaryInterface}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatRate(rates.primary.down).value}{' '}
                    <span className="text-xs font-normal text-muted-foreground">{formatRate(rates.primary.down).unit}</span>
                  </p>
                </div>
                <div className="rounded-lg border px-4 py-3">
                  <p className="text-xs text-muted-foreground">物理网卡上传 · {primaryInterface}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatRate(rates.primary.up).value}{' '}
                    <span className="text-xs font-normal text-muted-foreground">{formatRate(rates.primary.up).unit}</span>
                  </p>
                </div>
                <div className="rounded-lg border px-4 py-3">
                  <p className="text-xs text-muted-foreground">本次打开页面累计（VPN）</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    下载 {sessionDown.value} {sessionDown.unit} · 上传 {sessionUp.value} {sessionUp.unit}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>默认路由：{stats?.defaultRoute?.interface || '—'}（{stats?.defaultRoute?.gateway || '—'}）</span>
                <span>线路模式：{stats?.route?.label || '—'}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <RateCard
                  title={`物理网卡下载 · ${primaryInterface}`}
                  icon={Download}
                  rate={rates.primary.down}
                  samples={samples.primaryDown}
                  colorClass="text-emerald-500"
                />
                <RateCard
                  title={`物理网卡上传 · ${primaryInterface}`}
                  icon={Upload}
                  rate={rates.primary.up}
                  samples={samples.primaryUp}
                  colorClass="text-sky-500"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                连接 VPN 后，这里会切换为 VPN 隧道的实时速率。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            <CardTitle>国际节点测速</CardTitle>
            <Badge variant="outline">{currentMode === 'direct' ? '直连' : currentMode === 'vpn' ? 'VPN 全隧道' : 'VPN 分流'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              测速节点为 Cloudflare（speed.cloudflare.com），反映本机到国际网络的吞吐与延迟。
              测速结果会按「直连 / VPN」分别保存，方便对比同一节点下的差异。
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSpeedTest} disabled={speedTest.running}>
              {speedTest.running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {speedTest.running ? '测速中…' : '开始测速'}
            </Button>
            {speedTest.running && speedTest.phase && (
              <span className="text-xs text-muted-foreground">{phaseText}</span>
            )}
          </div>

          {speedTest.error && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {speedTest.error}
            </p>
          )}

          {speedTest.result && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">延迟</p>
                  <p className="mt-1 text-lg font-semibold">{formatLatency(speedTest.result.latencyMs)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">下载</p>
                  <p className="mt-1 text-lg font-semibold">{formatMbps(speedTest.result.downloadMbps)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">上传</p>
                  <p className="mt-1 text-lg font-semibold">{formatMbps(speedTest.result.uploadMbps)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">测速线路</p>
                  <p className="mt-1 text-sm font-medium">{speedTest.result.routeLabel || '—'}</p>
                </div>
              </div>
              {speedTest.result.downloadPartial && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  下载测试超时，以上为已接收部分的结果，仅供参考。
                </p>
              )}
              {speedTest.result.uploadError && (
                <p className="mt-1 text-xs text-muted-foreground">上传测试失败：{speedTest.result.uploadError}</p>
              )}
              {(speedTest.result.mode === 'split' || currentMode === 'split') && (
                <p className="mt-2 text-xs text-muted-foreground">
                  当前为分流模式，测速流量可能走物理网卡，不能完全代表 VPN 隧道速度。
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">历史测速对比</p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">线路</th>
                    <th className="px-3 py-2 text-right font-medium">下载</th>
                    <th className="px-3 py-2 text-right font-medium">上传</th>
                    <th className="px-3 py-2 text-right font-medium">延迟</th>
                    <th className="px-3 py-2 text-right font-medium">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {HISTORY_MODES.map((mode) => {
                    const record = history[mode.id];
                    return (
                      <tr key={mode.id} className="border-t">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            {mode.label}
                            {currentMode === mode.id && (
                              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">当前</Badge>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{record ? formatMbps(record.downloadMbps) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{record ? formatMbps(record.uploadMbps) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{record ? formatLatency(record.latencyMs) : '—'}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {record?.savedAt ? new Date(record.savedAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              建议：先断开 VPN 点一次测速作为本地基线，连接 VPN 后再测一次，对比下载与延迟差异。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default NetworkSpeed;
