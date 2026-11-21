import { useState } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { ShieldAlert } from 'lucide-react';

function PasswordPrompt() {
  const [password, setPassword] = useState('');
  const { ipcRenderer } = window.require('electron');

  const handleSubmit = (e) => {
    e.preventDefault();
    ipcRenderer.send('sudo-password-entered', password);
  };

  const handleCancel = () => {
    ipcRenderer.send('sudo-password-entered', null);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle className="text-center">需要管理员密码</CardTitle>
          <CardDescription className="text-center">
            OpenConnect 需要管理员权限才能创建 VPN 连接。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                type="password"
                id="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCancel}>
                取消
              </Button>
              <Button type="submit">
                确定
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default PasswordPrompt;
