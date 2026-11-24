import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  X,
  ShieldCheck,
  RefreshCw,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';

const REPO_URL = 'https://github.com/hkproto1/openconnect-gui';
const RELEASES_URL = `${REPO_URL}/releases`;
const ISSUES_URL = `${REPO_URL}/issues`;
const UPSTREAM_URL = 'https://github.com/jadedm/openconnect-gui';

// 更新说明来自 Markdown，简单去掉标题与加粗标记以便直接阅读
function formatNotes(notes) {
  return String(notes || '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .trim();
}

function AboutDialog({ open, onClose, appVersion }) {
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');

  const handleCheck = async () => {
    setChecking(true);
    setError('');
    setDownloadMessage('');
    try {
      const result = await window.electronAPI.checkForUpdate();
      if (!result.success) {
        setError(result.error || '检查更新失败');
      } else {
        setUpdateResult(result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  // 打开时自动检查一次最新版本
  useEffect(() => {
    if (open && !updateResult && !checking && !error) {
      handleCheck();
    }
  }, [open]);

  // 关闭后清理状态，下次打开重新检查
  useEffect(() => {
    if (!open) {
      setUpdateResult(null);
      setError('');
      setDownloadMessage('');
      setDownloading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const result = await window.electronAPI.downloadUpdate();
      if (!result.success) {
        setError(result.error || '下载更新失败');
      } else {
        setDownloadMessage('已开始下载，完成后会自动打开 dmg');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  if (!open) return null;

  const openLink = (url) => window.electronAPI.openExternal(url);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="w-full max-w-lg overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b bg-muted/30 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 id="about-title" className="text-lg font-semibold">OpenConnect VPN</h2>
              <p className="text-xs text-muted-foreground">macOS 图形客户端 · Electron + React</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">当前版本</p>
              <p className="text-xs text-muted-foreground">配置与连接数据均保存在本机</p>
            </div>
            <Badge variant="secondary" className="font-mono text-sm">v{appVersion || '—'}</Badge>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                <span className="text-sm font-medium">版本更新</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleCheck} disabled={checking}>
                {checking ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    检查中…
                  </>
                ) : (
                  '检查更新'
                )}
              </Button>
            </div>

            <div className="mt-3">
              {checking && (
                <p className="text-xs text-muted-foreground">正在连接 GitHub Releases…</p>
              )}

              {!checking && error && (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              {!checking && !error && updateResult && !updateResult.updateAvailable && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  当前已是最新版本（v{updateResult.latestVersion || updateResult.currentVersion}）
                </p>
              )}

              {!checking && !error && updateResult && updateResult.updateAvailable && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">发现新版本 v{updateResult.latestVersion}</p>
                  {updateResult.notes && (
                    <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {formatNotes(updateResult.notes)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={handleDownload} disabled={downloading}>
                      {downloading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      下载并安装
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openLink(updateResult.releaseUrl || RELEASES_URL)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      打开发布页
                    </Button>
                  </div>
                  {downloadMessage && (
                    <p className="text-xs text-muted-foreground">{downloadMessage}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">GitHub 仓库</span>
              <button
                className="inline-flex items-center gap-1 text-primary hover:underline"
                onClick={() => openLink(REPO_URL)}
              >
                hkproto1/openconnect-gui
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">问题反馈</span>
              <button
                className="inline-flex items-center gap-1 text-primary hover:underline"
                onClick={() => openLink(ISSUES_URL)}
              >
                提交 Issue
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">上游项目</span>
              <button
                className="inline-flex items-center gap-1 text-primary hover:underline"
                onClick={() => openLink(UPSTREAM_URL)}
              >
                jadedm/openconnect-gui
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">许可证</span>
              <span>MIT</span>
            </div>
          </div>
        </div>

        <div className="border-t bg-muted/30 px-6 py-3 text-[11px] text-muted-foreground">
          应用未签名，请仅从本仓库 Releases 下载安装包；更新需手动拖入「应用程序」覆盖。
        </div>
      </div>
    </div>
  );
}

export default AboutDialog;
