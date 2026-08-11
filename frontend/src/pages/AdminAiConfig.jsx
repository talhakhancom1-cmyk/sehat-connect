import React, { useEffect, useState, useCallback, useRef } from 'react';
import Layout from '@/components/Layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Bot,
  Save,
  TestTube,
  Power,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkle,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function apiRequest(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('ehc_token');
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export default function AdminAiConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showKey, setShowKey] = useState(false);

  const [form, setForm] = useState({
    openai_api_key: '',
    openai_model: 'gpt-4o-mini',
    symptom_checker_enabled: true,
    daily_check_limit: 10,
  });

  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/ai-config');
      if (data.configured) {
        setConfig(data);
        setForm({
          openai_api_key: '', // never pre-fill the key
          openai_model: data.openai_model || 'gpt-4o-mini',
          symptom_checker_enabled: data.symptom_checker_enabled ?? true,
          daily_check_limit: data.daily_check_limit ?? 10,
        });
      } else {
        setConfig(null);
      }
    } catch (e) {
      toast({ title: 'Failed to load AI config', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    load();
  }, [load]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        openai_model: form.openai_model,
        symptom_checker_enabled: form.symptom_checker_enabled,
        daily_check_limit: Number(form.daily_check_limit),
      };
      // Only send the API key if the user typed a new one
      if (form.openai_api_key.trim()) {
        body.openai_api_key = form.openai_api_key.trim();
      }
      const data = await apiRequest('/ai-config', { method: 'POST', body });
      setConfig(data);
      setForm((f) => ({ ...f, openai_api_key: '' }));
      toast({ title: 'AI configuration saved', description: 'Settings updated successfully.' });
    } catch (e) {
      toast({ title: 'Save failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const testKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body = {};
      if (form.openai_api_key.trim()) {
        body.openai_api_key = form.openai_api_key.trim();
      }
      body.openai_model = form.openai_model;
      const data = await apiRequest('/ai-config/test', { method: 'POST', body });
      setTestResult(data);
      if (data.success) {
        toast({ title: 'OpenAI key valid', description: data.message });
      } else {
        toast({ title: 'OpenAI key test failed', description: data.error, variant: 'destructive' });
      }
    } catch (e) {
      setTestResult({ success: false, error: String(e?.message || e) });
      toast({ title: 'Test failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const deactivate = async () => {
    if (!confirm('Deactivate AI configuration? The symptom checker will stop working until reconfigured.')) return;
    try {
      await apiRequest('/ai-config', { method: 'DELETE' });
      setConfig(null);
      setForm({ openai_api_key: '', openai_model: 'gpt-4o-mini', symptom_checker_enabled: true, daily_check_limit: 10 });
      toast({ title: 'AI configuration deactivated' });
    } catch (e) {
      toast({ title: 'Failed to deactivate', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  return (
    <Layout role="admin" title="AI Configuration">
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">AI Symptom Checker Configuration</h1>
            <p className="text-sm text-muted-foreground">Manage the OpenAI API key and symptom checker settings</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Status badge */}
            {config?.configured && (
              <div className="flex items-center gap-2">
                <Badge variant={config.openai_api_key_set ? 'default' : 'secondary'}>
                  {config.openai_api_key_set ? (
                    <><CheckCircle2 className="w-3 h-3 mr-1" /> API Key Set</>
                  ) : (
                    <><AlertCircle className="w-3 h-3 mr-1" /> No API Key</>
                  )}
                </Badge>
                {config.openai_api_key_set && config.openai_api_key_prefix && (
                  <span className="text-xs text-muted-foreground font-mono">{config.openai_api_key_prefix}</span>
                )}
                <Badge variant={config.symptom_checker_enabled ? 'default' : 'secondary'}>
                  {config.symptom_checker_enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            )}

            {/* OpenAI API Key */}
            <div className="bg-card rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex items-center gap-2">
                <Sparkle className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm">OpenAI API Key</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                {config?.openai_api_key_set
                  ? 'A key is already configured. Enter a new key below to replace it. Leave blank to keep the existing key.'
                  : 'Enter your OpenAI API key. It is encrypted at rest and never exposed to the frontend.'}
              </p>
              <div className="space-y-2">
                <Label htmlFor="openai_key">API Key</Label>
                <div className="relative">
                  <Input
                    id="openai_key"
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-proj-..."
                    value={form.openai_api_key}
                    onChange={(e) => update('openai_api_key', e.target.value)}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">platform.openai.com/api-keys</a>
                </p>
              </div>

              {/* Model */}
              <div className="space-y-2">
                <Label htmlFor="openai_model">Model</Label>
                <Input
                  id="openai_model"
                  value={form.openai_model}
                  onChange={(e) => update('openai_model', e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Recommended: gpt-4o-mini (fast and cost-effective)</p>
              </div>

              {/* Test button */}
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={testKey} disabled={testing || (!form.openai_api_key.trim() && !config?.openai_api_key_set)}>
                  {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</> : <><TestTube className="w-4 h-4 mr-2" /> Test Key</>}
                </Button>
                {testResult && (
                  <span className={`text-xs flex items-center gap-1 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResult.success ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {testResult.success ? testResult.message : testResult.error}
                  </span>
                )}
              </div>
            </div>

            {/* Symptom Checker Settings */}
            <div className="bg-card rounded-2xl p-5 shadow-card space-y-4">
              <h2 className="font-semibold text-sm">Symptom Checker Settings</h2>

              {/* Master toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sc_enabled">Symptom Checker Enabled</Label>
                  <p className="text-xs text-muted-foreground">Master toggle for the AI symptom checker feature</p>
                </div>
                <Switch
                  id="sc_enabled"
                  checked={form.symptom_checker_enabled}
                  onCheckedChange={(v) => update('symptom_checker_enabled', v)}
                />
              </div>

              {/* Daily limit */}
              <div className="space-y-2">
                <Label htmlFor="daily_limit">Daily Check Limit (per user)</Label>
                <Input
                  id="daily_limit"
                  type="number"
                  min="1"
                  max="100"
                  value={form.daily_check_limit}
                  onChange={(e) => update('daily_check_limit', e.target.value)}
                  className="w-24"
                />
                <p className="text-xs text-muted-foreground">Maximum symptom checker sessions per user per day</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save Configuration</>}
              </Button>
              {config?.configured && (
                <Button variant="outline" onClick={deactivate} className="text-red-600 hover:text-red-700">
                  <Power className="w-4 h-4 mr-2" /> Deactivate
                </Button>
              )}
            </div>

            {/* Security note */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
              <p className="font-semibold mb-1">Security Notes</p>
              <ul className="list-disc list-inside space-y-1">
                <li>The API key is encrypted at rest using AES-256-GCM</li>
                <li>The key is never returned in full by the API — only a prefix is shown</li>
                <li>The key is never exposed in frontend bundles or logs</li>
                <li>Only admin users can view or modify this configuration</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
