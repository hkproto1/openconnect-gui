import { useState } from 'react';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Separator } from './components/ui/separator';
import { Copy, Terminal } from 'lucide-react';

function Installer() {
  const [status, setStatus] = useState({ show: false, message: '', type: 'info' });
  const [installBtnText, setInstallBtnText] = useState('自动安装 OpenConnect');
  const [installBtnDisabled, setInstallBtnDisabled] = useState(false);

  const { ipcRenderer } = window.require('electron');

  const copyCode = (text, button) => {
    navigator.clipboard.writeText(text).then(() => {
      const originalText = button.textContent;
      button.textContent = '已复制！';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    });
  };

  const installOpenConnect = async () => {
    setInstallBtnDisabled(true);
    setInstallBtnText('正在安装…');
    setStatus({ show: true, message: '正在通过 Homebrew 安装 OpenConnect，可能需要几分钟…', type: 'info' });

    try {
      const result = await ipcRenderer.invoke('install-openconnect');

      if (result.success) {
        setStatus({
          show: true,
          message: '✅ OpenConnect 安装成功！现在可以关闭此窗口并使用应用了。',
          type: 'success'
        });
        setInstallBtnText('安装成功');
        setTimeout(() => {
          ipcRenderer.send('openconnect-installed');
        }, 2000);
      } else {
        setStatus({
          show: true,
          message: `❌ 安装失败：${result.error}。请尝试在终端中手动安装。`,
          type: 'error'
        });
        setInstallBtnDisabled(false);
        setInstallBtnText('重试');
      }
    } catch (error) {
      setStatus({
        show: true,
        message: `❌ 出错：${error.message}。请尝试在终端中手动安装。`,
        type: 'error'
      });
      setInstallBtnDisabled(false);
      setInstallBtnText('重试');
    }
  };

  const openTerminal = () => {
    ipcRenderer.send('open-terminal');
  };

  const checkAgain = async () => {
    setStatus({ show: true, message: '正在检测 OpenConnect…', type: 'info' });

    const result = await ipcRenderer.invoke('check-openconnect');

    if (result.installed) {
      setStatus({
        show: true,
        message: '✅ OpenConnect 已安装，正在关闭此窗口…',
        type: 'success'
      });
      setTimeout(() => {
        ipcRenderer.send('openconnect-installed');
      }, 1500);
    } else {
      setStatus({
        show: true,
        message: '❌ 尚未检测到 OpenConnect，请使用上述任一方式安装。',
        type: 'error'
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-bold">需要安装 OpenConnect</h1>
          <p className="text-muted-foreground">
            本应用依赖系统中的 OpenConnect，需要先安装。
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="font-semibold">⚠️ 重要说明</div>
              <p className="text-sm text-muted-foreground">
                OpenConnect 是一个命令行 VPN 客户端，必须单独安装。因为 VPN 连接需要底层网络访问权限。
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-foreground font-bold">
                  1
                </div>
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-semibold">安装 Homebrew（如果尚未安装）</h3>
                  <p className="text-sm text-muted-foreground">
                    Homebrew 是 macOS 的包管理器。请在终端中执行：
                  </p>
                  <div className="relative rounded-md border bg-muted p-3 font-mono text-sm">
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute right-2 top-2"
                      onClick={(e) =>
                        copyCode(
                          '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
                          e.target
                        )
                      }
                    >
                      <Copy className="mr-2 h-3 w-3" />
                      复制
                    </Button>
                    <code className="pr-20">
                      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                    </code>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-foreground font-bold">
                  2
                </div>
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-semibold">安装 OpenConnect</h3>
                  <p className="text-sm text-muted-foreground">
                    Homebrew 安装完成后，执行：
                  </p>
                  <div className="relative rounded-md border bg-muted p-3 font-mono text-sm">
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute right-2 top-2"
                      onClick={(e) => copyCode('brew install openconnect', e.target)}
                    >
                      <Copy className="mr-2 h-3 w-3" />
                      复制
                    </Button>
                    <code>brew install openconnect</code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    或点击下方按钮自动运行安装脚本：
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-foreground font-bold">
                  3
                </div>
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-semibold">重启应用</h3>
                  <p className="text-sm text-muted-foreground">
                    安装完成后，请关闭并重新启动本应用。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-3">
          <Button disabled={installBtnDisabled} onClick={installOpenConnect} size="lg">
            {installBtnText}
          </Button>
          <Button variant="outline" onClick={openTerminal}>
            <Terminal className="mr-2 h-4 w-4" />
            打开终端
          </Button>
          <Button variant="outline" onClick={checkAgain}>
            重新检测
          </Button>
        </div>

        {status.show && (
          <Card
            className={
              status.type === 'error'
                ? 'border-destructive bg-destructive/10'
                : status.type === 'success'
                ? 'border-foreground bg-foreground/10'
                : ''
            }
          >
            <CardContent className="pt-6">
              <p className="text-sm">{status.message}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default Installer;
