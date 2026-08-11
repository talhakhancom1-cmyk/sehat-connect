import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Radar, Save, Trash2 } from 'lucide-react';

export default function AdminPixels() {
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const list = await base44.entities.TrackingConfig.list();
      setConfig(list[0] || null);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  const blank = () => ({
    meta_pixel_id: '',
    tiktok_pixel_id: '',
    meta_enabled: true,
    tiktok_enabled: true,
    note: '',
  });

  const form = config || blank();

  const update = (field, value) => setConfig({ ...form, ...config, [field]: value });

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        meta_pixel_id: form.meta_pixel_id?.trim() || '',
        tiktok_pixel_id: form.tiktok_pixel_id?.trim() || '',
        meta_enabled: !!form.meta_enabled,
        tiktok_enabled: !!form.tiktok_enabled,
        note: form.note || '',
      };
      if (config?.id) {
        await base44.entities.TrackingConfig.update(config.id, payload);
      } else {
        const created = await base44.entities.TrackingConfig.create(payload);
        setConfig(created);
      }
      toast({ title: 'Pixel settings saved' });
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!config?.id) return;
    if (!confirm('Remove the pixel configuration? Tracking will stop immediately.')) return;
    setSaving(true);
    try {
      await base44.entities.TrackingConfig.delete(config.id);
      setConfig(null);
      toast({ title: 'Pixel settings removed' });
    } catch (e) {
      toast({ title: 'Could not remove', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout role="admin" title="Tracking Pixels">
      <div className="max-w-2xl space-y-5 animate-fade-in">
        <div className="bg-card rounded-2xl p-5 shadow-card flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Radar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Marketing Pixels</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Configure your Meta (Facebook) and TikTok pixel IDs. Once saved, the pixel scripts load on every page and fire a PageView on navigation. Pixel IDs are public identifiers and safe to expose in the page.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bg-card rounded-2xl shadow-card p-6 space-y-4">
            <div className="h-10 shimmer rounded-xl" />
            <div className="h-10 shimmer rounded-xl" />
          </div>
        ) : (
          <>
            {/* Meta Pixel */}
            <div className="bg-card rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">M</div>
                  <h3 className="text-sm font-semibold">Meta Pixel</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{form.meta_enabled ? 'Enabled' : 'Disabled'}</span>
                  <Switch checked={!!form.meta_enabled} onCheckedChange={(v) => update('meta_enabled', v)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta_pixel_id" className="text-xs">Pixel ID</Label>
                <Input
                  id="meta_pixel_id"
                  value={form.meta_pixel_id || ''}
                  onChange={(e) => update('meta_pixel_id', e.target.value)}
                  placeholder="e.g. 1234567890123456"
                  disabled={!form.meta_enabled}
                />
              </div>
            </div>

            {/* TikTok Pixel */}
            <div className="bg-card rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-xs">T</div>
                  <h3 className="text-sm font-semibold">TikTok Pixel</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{form.tiktok_enabled ? 'Enabled' : 'Disabled'}</span>
                  <Switch checked={!!form.tiktok_enabled} onCheckedChange={(v) => update('tiktok_enabled', v)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tiktok_pixel_id" className="text-xs">Pixel ID</Label>
                <Input
                  id="tiktok_pixel_id"
                  value={form.tiktok_pixel_id || ''}
                  onChange={(e) => update('tiktok_pixel_id', e.target.value)}
                  placeholder="e.g. Cxxxxxxxxxxxxx"
                  disabled={!form.tiktok_enabled}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note" className="text-xs">Note (optional)</Label>
              <Input
                id="note"
                value={form.note || ''}
                onChange={(e) => update('note', e.target.value)}
                placeholder="e.g. Production pixels — managed by marketing"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={saving} className="flex items-center gap-1.5">
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
              {config?.id && (
                <Button onClick={remove} disabled={saving} variant="outline" className="text-destructive hover:text-destructive flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4" />
                  Remove
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}