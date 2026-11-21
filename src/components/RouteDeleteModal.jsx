import { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';

function RouteDeleteModal({ route, onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!route) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('请输入密码');
      return;
    }

    setIsDeleting(true);
    setError('');

    const result = await onConfirm(password);

    setIsDeleting(false);

    if (result && result.success) {
      // Success - modal will be closed by parent
      setPassword('');
      setError('');
    } else if (result && result.error) {
      // Error - keep modal open and show error
      setError(result.error);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError('');
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-destructive/10 p-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">删除路由</h2>
            <p className="text-sm text-muted-foreground mt-1">
              此操作将从系统中删除以下路由
            </p>
          </div>
        </div>

        <div className="bg-muted p-3 rounded font-mono text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{route.destination}</span>
            <span className="text-muted-foreground">→</span>
            <span>{route.gateway}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            经由 {route.interface}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="sudo-password">管理员密码</Label>
            </div>
            <Input
              type="password"
              id="sudo-password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              autoFocus
              className={error ? 'border-destructive' : ''}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <p className="text-xs text-muted-foreground">
              修改系统路由需要管理员权限
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isDeleting}>
              取消
            </Button>
            <Button type="submit" variant="destructive" disabled={isDeleting}>
              {isDeleting ? '正在删除…' : '删除路由'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default RouteDeleteModal;
