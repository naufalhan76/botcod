'use client';

import { useState, useEffect } from 'react';
import { useSettings, useUpdateSettings } from '@/hooks/use-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TableSkeleton } from '@/components/table-skeleton';
import { showSuccess, showError } from '@/lib/toast';
import { MdSave, MdContentCopy } from 'react-icons/md';

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [formData, setFormData] = useState({
    COOLDOWN_MS: 86400000,
    MAX_ROTATIONS_PER_REQUEST: 5,
    EXPOSED_MODELS: '',
    MODEL_CAPS_OVERRIDES: '',
    RTK_ENABLED: false,
    CAVEMAN_ENABLED: false,
    CAVEMAN_LEVEL: 'full',
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        COOLDOWN_MS: settings.COOLDOWN_MS || 86400000,
        MAX_ROTATIONS_PER_REQUEST: settings.MAX_ROTATIONS_PER_REQUEST || 5,
        EXPOSED_MODELS: Array.isArray(settings.EXPOSED_MODELS)
          ? settings.EXPOSED_MODELS.join('\n')
          : '',
        MODEL_CAPS_OVERRIDES: settings.MODEL_CAPS_OVERRIDES
          ? JSON.stringify(settings.MODEL_CAPS_OVERRIDES, null, 2)
          : '',
        RTK_ENABLED: settings.RTK_ENABLED || false,
        CAVEMAN_ENABLED: settings.CAVEMAN_ENABLED || false,
        CAVEMAN_LEVEL: settings.CAVEMAN_LEVEL || 'full',
      });
    }
  }, [settings]);

  const handleSave = () => {
    const payload: any = {};

    // Only include changed fields
    if (formData.COOLDOWN_MS !== settings?.COOLDOWN_MS) {
      payload.COOLDOWN_MS = formData.COOLDOWN_MS;
    }
    if (formData.MAX_ROTATIONS_PER_REQUEST !== settings?.MAX_ROTATIONS_PER_REQUEST) {
      payload.MAX_ROTATIONS_PER_REQUEST = formData.MAX_ROTATIONS_PER_REQUEST;
    }
    if (formData.EXPOSED_MODELS !== (settings?.EXPOSED_MODELS || []).join('\n')) {
      payload.EXPOSED_MODELS = formData.EXPOSED_MODELS.split('\n').filter((m) => m.trim());
    }
    if (formData.MODEL_CAPS_OVERRIDES !== JSON.stringify(settings?.MODEL_CAPS_OVERRIDES || {}, null, 2)) {
      try {
        payload.MODEL_CAPS_OVERRIDES = JSON.parse(formData.MODEL_CAPS_OVERRIDES || '{}');
      } catch (e) {
        showError('Invalid JSON in Model Caps Overrides');
        return;
      }
    }
    if (formData.RTK_ENABLED !== settings?.RTK_ENABLED) {
      payload.RTK_ENABLED = formData.RTK_ENABLED;
    }
    if (formData.CAVEMAN_ENABLED !== settings?.CAVEMAN_ENABLED) {
      payload.CAVEMAN_ENABLED = formData.CAVEMAN_ENABLED;
    }
    if (formData.CAVEMAN_LEVEL !== settings?.CAVEMAN_LEVEL) {
      payload.CAVEMAN_LEVEL = formData.CAVEMAN_LEVEL;
    }

    if (Object.keys(payload).length === 0) {
      showSuccess('No changes to save');
      return;
    }

    updateSettings.mutate(payload, {
      onSuccess: () => showSuccess('Settings saved'),
      onError: () => showError('Failed to save settings'),
    });
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days !== 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  const openCodeSnippet = settings?.MODEL_CAPS
    ? JSON.stringify(settings.MODEL_CAPS, null, 2)
    : '{}';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">Configure router settings</p>
        </div>
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Configure router settings and model capabilities</p>
      </div>

      <Tabs defaultValue="rotation" className="space-y-6">
        <TabsList>
          <TabsTrigger value="rotation">Rotation</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        {/* Rotation Tab */}
        <TabsContent value="rotation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rotation Settings</CardTitle>
              <CardDescription>Configure key rotation behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="cooldown">Cooldown Duration (ms)</Label>
                <Input
                  id="cooldown"
                  type="number"
                  value={formData.COOLDOWN_MS}
                  onChange={(e) =>
                    setFormData({ ...formData, COOLDOWN_MS: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDuration(formData.COOLDOWN_MS)}
                </p>
              </div>
              <div>
                <Label htmlFor="max-rotations">Max Rotations Per Request</Label>
                <Input
                  id="max-rotations"
                  type="number"
                  value={formData.MAX_ROTATIONS_PER_REQUEST}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      MAX_ROTATIONS_PER_REQUEST: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Models Tab */}
        <TabsContent value="models" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Exposed Models</CardTitle>
              <CardDescription>One model per line</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.EXPOSED_MODELS}
                onChange={(e) => setFormData({ ...formData, EXPOSED_MODELS: e.target.value })}
                rows={10}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model Caps Overrides</CardTitle>
              <CardDescription>JSON object with per-model capability overrides</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.MODEL_CAPS_OVERRIDES}
                onChange={(e) =>
                  setFormData({ ...formData, MODEL_CAPS_OVERRIDES: e.target.value })
                }
                rows={10}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Optimization Tab */}
        <TabsContent value="optimization" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Features</CardTitle>
              <CardDescription>Enable experimental features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="rtk">RTK Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable Request Token Keeper optimization
                  </p>
                </div>
                <Switch
                  id="rtk"
                  checked={formData.RTK_ENABLED}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, RTK_ENABLED: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="caveman">Caveman Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable compressed communication mode
                  </p>
                </div>
                <Switch
                  id="caveman"
                  checked={formData.CAVEMAN_ENABLED}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, CAVEMAN_ENABLED: checked })
                  }
                />
              </div>

              {formData.CAVEMAN_ENABLED && (
                <div>
                  <Label htmlFor="caveman-level">Caveman Level</Label>
                  <Select
                    value={formData.CAVEMAN_LEVEL}
                    onValueChange={(value) =>
                      setFormData({ ...formData, CAVEMAN_LEVEL: value })
                    }
                  >
                    <SelectTrigger id="caveman-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lite">Lite</SelectItem>
                      <SelectItem value="full">Full</SelectItem>
                      <SelectItem value="ultra">Ultra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* About Tab */}
        <TabsContent value="about" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Server Information</CardTitle>
              <CardDescription>Read-only configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Upstream Base URL</Label>
                <p className="text-sm font-mono mt-1">{settings?.UPSTREAM_BASE || '-'}</p>
              </div>
              <div>
                <Label>Port</Label>
                <p className="text-sm font-mono mt-1">{settings?.PORT || '-'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>OpenCode Configuration</CardTitle>
              <CardDescription>Copy this snippet to your OpenCode config</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                  {openCodeSnippet}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(openCodeSnippet)}
                >
                  <MdContentCopy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          <MdSave className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
