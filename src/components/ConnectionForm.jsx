import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Trash2, Settings } from 'lucide-react';

function ConnectionForm({
  profiles,
  setProfiles,
  currentStatus,
  openConnectInstalled,
  showAlert,
  addLog,
  saveProfiles,
  loadProfiles,
  onServerChange
}) {
  const [formData, setFormData] = useState({
    profileName: '',
    serverUrl: '',
    username: '',
    password: '',
    authgroup: '',
    protocol: 'anyconnect',
    serverCert: ''
  });
  const [selectedProfile, setSelectedProfile] = useState('__new__');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Notify parent when server URL changes
    if (name === 'serverUrl' && onServerChange) {
      onServerChange(value);
    }
  };

  const handleProfileSelect = (profileName) => {
    setSelectedProfile(profileName);

    if (!profileName || profileName === '__new__') {
      // Clear form
      setFormData({
        profileName: '',
        serverUrl: '',
        username: '',
        password: '',
        authgroup: '',
        protocol: 'anyconnect',
        serverCert: ''
      });
      setSelectedProfile('__new__');
      if (onServerChange) {
        onServerChange('');
      }
      return;
    }

    const profile = profiles.find(p => p.name === profileName);
    if (profile) {
      setFormData({
        profileName: profile.name,
        serverUrl: profile.server,
        username: profile.username,
        password: profile.password,
        authgroup: profile.authgroup || '',
        protocol: profile.protocol || 'anyconnect',
        serverCert: profile.serverCert || ''
      });
      if (onServerChange) {
        onServerChange(profile.server);
      }
    }
  };

  const handleConnect = async () => {
    if (!formData.serverUrl || !formData.username || !formData.password) {
      showAlert('请填写所有必填项', 'error');
      return;
    }

    addLog('正在尝试连接…', 'info');

    const config = {
      server: formData.serverUrl.trim(),
      username: formData.username.trim(),
      password: formData.password.trim(),
      authgroup: formData.authgroup?.trim() || undefined,
      protocol: formData.protocol || 'anyconnect',
      serverCert: formData.serverCert?.trim() || undefined
    };

    const result = await window.electronAPI.connectVPN(config);

    if (!result.success) {
      showAlert(`连接失败：${result.error}`, 'error');
      addLog(`连接失败：${result.error}`, 'error');
    } else {
      addLog('已发起连接…', 'info');
    }
  };

  const handleDisconnect = async () => {
    addLog('正在断开连接…', 'info');
    const result = await window.electronAPI.disconnectVPN();

    if (!result.success) {
      showAlert(`断开连接失败：${result.error}`, 'error');
    }
  };

  const handleSaveProfile = async () => {
    if (!formData.profileName) {
      showAlert('请输入配置名称', 'error');
      return;
    }

    if (!formData.serverUrl || !formData.username) {
      showAlert('请填写服务器地址和用户名', 'error');
      return;
    }

    const profile = {
      name: formData.profileName,
      server: formData.serverUrl,
      username: formData.username,
      password: formData.password,
      authgroup: formData.authgroup || '',
      protocol: formData.protocol || 'anyconnect',
      serverCert: formData.serverCert || ''
    };

    const existingIndex = profiles.findIndex(p => p.name === formData.profileName);
    let newProfiles;

    if (existingIndex >= 0) {
      // Update existing
      newProfiles = [...profiles];
      newProfiles[existingIndex] = profile;
      showAlert(`配置「${formData.profileName}」已更新`, 'success');
    } else {
      // Add new
      newProfiles = [...profiles, profile];
      showAlert(`配置「${formData.profileName}」已保存`, 'success');
    }

    setProfiles(newProfiles);
    await saveProfiles(newProfiles);
    addLog(`配置「${formData.profileName}」已保存`, 'info');
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfile) return;

    if (window.confirm(`确定要删除配置「${selectedProfile}」吗？`)) {
      const newProfiles = profiles.filter(p => p.name !== selectedProfile);
      setProfiles(newProfiles);
      await saveProfiles(newProfiles);

      // Clear form and selection
      setSelectedProfile('__new__');
      setFormData({
        profileName: '',
        serverUrl: '',
        username: '',
        password: '',
        authgroup: '',
        protocol: 'anyconnect',
        serverCert: ''
      });

      showAlert(`配置「${selectedProfile}」已删除`, 'success');
      addLog(`配置「${selectedProfile}」已删除`, 'info');
    }
  };

  const isConnecting = currentStatus === 'connecting';
  const isConnected = currentStatus === 'connected';
  const isDisconnected = currentStatus === 'disconnected';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <CardTitle>连接设置</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Profile Selection */}
        <div className="space-y-2">
          <Label htmlFor="profileSelect">已保存的配置</Label>
          <div className="flex gap-2">
            <Select value={selectedProfile} onValueChange={handleProfileSelect}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="-- 新建连接 --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">-- 新建连接 --</SelectItem>
                {profiles.map(profile => (
                  <SelectItem key={profile.name} value={profile.name}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              title="删除配置"
              disabled={!selectedProfile || selectedProfile === '__new__'}
              onClick={handleDeleteProfile}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Connection Form */}
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profileName">配置名称（可选）</Label>
            <Input
              type="text"
              id="profileName"
              name="profileName"
              placeholder="我的 VPN 连接"
              value={formData.profileName}
              onChange={handleInputChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serverUrl">VPN 服务器地址 *</Label>
            <Input
              type="text"
              id="serverUrl"
              name="serverUrl"
              placeholder="vpn.example.com"
              required
              value={formData.serverUrl}
              onChange={handleInputChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">用户名 *</Label>
            <Input
              type="text"
              id="username"
              name="username"
              placeholder="用户名"
              required
              value={formData.username}
              onChange={handleInputChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码 *</Label>
            <Input
              type="password"
              id="password"
              name="password"
              placeholder="密码"
              required
              value={formData.password}
              onChange={handleInputChange}
            />
            <p className="text-xs text-muted-foreground">⚠️ 注意：密码会以明文形式保存在本地</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="authgroup">组 / 认证组（可选）</Label>
            <Input
              type="text"
              id="authgroup"
              name="authgroup"
              placeholder="group-name"
              value={formData.authgroup}
              onChange={handleInputChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="protocol">协议</Label>
            <Select value={formData.protocol} onValueChange={(value) => setFormData(prev => ({ ...prev, protocol: value }))}>
              <SelectTrigger id="protocol">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anyconnect">AnyConnect（Cisco）</SelectItem>
                <SelectItem value="nc">Juniper Network Connect</SelectItem>
                <SelectItem value="gp">GlobalProtect（Palo Alto）</SelectItem>
                <SelectItem value="pulse">Pulse Connect Secure</SelectItem>
                <SelectItem value="f5">F5 Big-IP</SelectItem>
                <SelectItem value="fortinet">Fortinet</SelectItem>
                <SelectItem value="array">Array Networks</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">选择服务器使用的 VPN 协议</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serverCert">服务器证书（可选）</Label>
            <Input
              type="text"
              id="serverCert"
              name="serverCert"
              placeholder="pin-sha256:xxxxx..."
              value={formData.serverCert}
              onChange={handleInputChange}
            />
            <p className="text-xs text-muted-foreground">示例：pin-sha256:AAAA1111BBB2222CCC3333DDD4444EEE5555FFF6666=</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!openConnectInstalled || !isDisconnected}
              onClick={handleConnect}
            >
              连接
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDisconnected}
              onClick={handleDisconnect}
            >
              断开连接
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveProfile}
            >
              保存配置
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default ConnectionForm;
