import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import SiteSettings from './SiteSettings';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { Settings, Save, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../ui/utils';

interface NugBox {
  pk_device_id: number;
  name: string;
  ip_address: string;
  config: {
    match_threshold: number;
    confidence_threshold: number;
    cooldown_seconds: number;
    x_threshold_pixels: number;
    tracking_window_frames: number;
  };
}

export const AdminSettings: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [nugBoxes, setNugBoxes] = useState<NugBox[]>([]);
  const [selectedNugBoxId, setSelectedNugBoxId] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState({
    match: 0.38,
    confidence: 0.35,
    cooldown: 3,
    x_threshold: 25,
    tracking: 6,
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNugBoxes();
  }, [accessToken]);

  const fetchNugBoxes = async () => {
    if (!accessToken) return;
    try {
      const res = await apiRequest<{data: NugBox[]}>('/api/devices/nug-boxes', { accessToken, scopeHeaders });
      setNugBoxes(res.data || []);
      if (res.data.length > 0) {
        const first = res.data[0];
        setSelectedNugBoxId(String(first.pk_device_id));
        setThresholds({
          match: first.config.match_threshold,
          confidence: first.config.confidence_threshold,
          cooldown: first.config.cooldown_seconds,
          x_threshold: first.config.x_threshold_pixels,
          tracking: first.config.tracking_window_frames,
        });
      }
    } catch (e) {
      toast.error('Failed to load NUG boxes');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!selectedNugBoxId) return;
    setSaving(true);
    try {
      // PUT config
      await apiRequest(`/api/devices/nug-boxes/${selectedNugBoxId}`, {
        method: 'PUT',
        accessToken,
        scopeHeaders,
        body: JSON.stringify({ 
          config: {
            match_threshold: thresholds.match,
            confidence_threshold: thresholds.confidence,
            cooldown_seconds: thresholds.cooldown,
            x_threshold_pixels: thresholds.x_threshold,
            tracking_window_frames: thresholds.tracking,
          }
        }),
      });
      // POST apply-config
      await apiRequest(`/api/devices/nug-boxes/${selectedNugBoxId}/apply-config`, {
        method: 'POST',
        accessToken,
        scopeHeaders,
      });
      toast.success('Config updated and applied to Jetson');
    } catch (e) {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedBox = nugBoxes.find(b => String(b.pk_device_id) === selectedNugBoxId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Admin Settings</h2>
          <p className="text-sm text-slate-500 mt-1">Site, recognition and notification configuration</p>
        </div>
      </div>

      <Tabs defaultValue="site" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="site">Site Profile</TabsTrigger>
          <TabsTrigger value="recognition" disabled={nugBoxes.length === 0 || loading}>Recognition</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="site">
          <SiteSettings />
        </TabsContent>

        <TabsContent value="recognition">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-400">
              Loading NUG boxes...
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">NUG Box Selection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {nugBoxes.map(box => (
                        <Button
                          key={box.pk_device_id}
                          variant={selectedNugBoxId === String(box.pk_device_id) ? 'default' : 'outline'}
                          className="w-full justify-start h-12 rounded-xl"
                          onClick={() => {
                            setSelectedNugBoxId(String(box.pk_device_id));
                            setThresholds({
                              match: box.config.match_threshold,
                              confidence: box.config.confidence_threshold,
                              cooldown: box.config.cooldown_seconds,
                              x_threshold: box.config.x_threshold_pixels,
                              tracking: box.config.tracking_window_frames,
                            });
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                              NUG
                            </div>
                            <div className="text-left">
                              <p className="font-semibold text-sm">{box.name}</p>
                              <p className="text-xs text-slate-500">{box.ip_address}</p>
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Current Config</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6 text-sm">
                      <div>
                        <Label className="text-xs font-bold uppercase text-slate-500 mb-2 block">Match Threshold</Label>
                        <Slider
                          value={[thresholds.match * 100]}
                          onValueChange={(v) => setThresholds(t => ({...t, match: v[0]/100 }))}
                          max={90}
                          step={1}
                          className="w-full"
                        />
                        <div className="text-xs text-slate-500 mt-1">{(thresholds.match).toFixed(2)}</div>
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase text-slate-500 mb-2 block">Confidence Threshold</Label>
                        <Slider
                          value={[thresholds.confidence * 100]}
                          onValueChange={(v) => setThresholds(t => ({...t, confidence: v[0]/100 }))}
                          max={90}
                          step={1}
                          className="w-full"
                        />
                        <div className="text-xs text-slate-500 mt-1">{(thresholds.confidence).toFixed(2)}</div>
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase text-slate-500 mb-2 block">Cooldown Seconds</Label>
                        <Slider
                          value={[thresholds.cooldown]}
                          onValueChange={(v) => setThresholds(t => ({...t, cooldown: v[0] }))}
                          max={60}
                          step={1}
                          className="w-full"
                        />
                        <div className="text-xs text-slate-500 mt-1">{thresholds.cooldown}s</div>
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase text-slate-500 mb-2 block">X Threshold Pixels</Label>
                        <Slider
                          value={[thresholds.x_threshold]}
                          onValueChange={(v) => setThresholds(t => ({...t, x_threshold: v[0] }))}
                          max={100}
                          step={1}
                          className="w-full"
                        />
                        <div className="text-xs text-slate-500 mt-1">{thresholds.x_threshold}px</div>
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase text-slate-500 mb-2 block">Tracking Window Frames</Label>
                        <Slider
                          value={[thresholds.tracking]}
                          onValueChange={(v) => setThresholds(t => ({...t, tracking: v[0] }))}
                          max={12}
                          step={1}
                          className="w-full"
                        />
                        <div className="text-xs text-slate-500 mt-1">{thresholds.tracking}f</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm">
                  Changes push to Jetson device <strong>immediately</strong> via SSH. Test thoroughly.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button onClick={saveConfig} disabled={!selectedNugBoxId || saving} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Apply to {selectedBox?.name}
                </Button>
                <Button onClick={fetchNugBoxes} variant="outline" className="flex-1">
                  Refresh
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <p className="text-sm text-slate-500">Email, SMS and in-app alerts</p>
            </CardHeader>
            <CardContent className="p-12 flex items-center justify-center text-slate-400">
              <Settings className="w-12 h-12 opacity-30 mb-4" />
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">Coming Soon</h3>
                <p>Notification workflows and templates</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

