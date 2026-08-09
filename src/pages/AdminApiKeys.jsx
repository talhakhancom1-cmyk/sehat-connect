import React, { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Globe,
  AlertTriangle,
  Loader2,
  Power,
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

export default function AdminApiKeys() {
  const { toast } = useToast();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [domainInput, setDomainInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    name: '',
    allowed_domains: [],
    scopes: ['*'],
    rate_limit_per_minute: 60,
    expires_at: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api-keys');
      setKeys(data.data || data || []);
    } catch (e) {
      toast({ title: 'Failed to load API keys', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ name: '', allowed_domains: [], scopes: ['*'], rate_limit_per_minute: 60, expires_at: '' });
    setDomainInput('');
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        allowed_domains: form.allowed_domains,
        scopes: form.scopes,
        rate_limit_per_minute: parseInt(form.rate_limit_per_minute, 10) || 60,
        expires_at: form.expires_at || null,
      };
      const created = await apiRequest('/api-keys', { method: 'POST', body: payload });
      setNewKeyResult(created);
      setShowCreate(false);
      resetForm();
      await load();
      toast({ title: 'API key created' });
    } catch (e) {
      toast({ title: 'Failed to create key', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this API key permanently? Any services using it will lose access immediately.')) return;
    try {
      await apiRequest(`/api-keys/${id}`, { method: 'DELETE' });
      toast({ title: 'API key deleted' });
      await load();
    } catch (e) {
      toast({ title: 'Failed to delete', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  const handleToggleActive = async (key) => {
    try {
      await apiRequest(`/api-keys/${key.id}`, { method: 'PUT', body: { is_active: !key.is_active } });
      toast({ title: key.is_active ? 'Key deactivated' : 'Key activated' });
      await load();
    } catch (e) {
      toast({ title: 'Failed to update', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  const handleRotate = async (key) => {
    if (!confirm('Rotate this API key? The old key will stop working immediately. Make sure you have access to update the services using it.')) return;
    try {
      const result = await apiRequest(`/api-keys/${key.id}/rotate`, { method: 'POST' });
      setNewKeyResult(result);
      await load();
      toast({ title: 'Key rotated — save the new key!' });
    } catch (e) {
      toast({ title: 'Failed to rotate', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  const handleAddDomain = () => {
    const d = domainInput.trim().toLowerCase();
    if (!d) return;
    if (form.allowed_domains.includes(d)) {
      toast({ title: 'Domain already added', variant: 'destructive' });
      return;
    }
    setForm({ ...form, allowed_domains: [...form.allowed_domains, d] });
    setDomainInput('');
  };

  const handleRemoveDomain = (domain) => {
    setForm({ ...form, allowed_domains: form.allowed_domains.filter((d) => d !== domain) });
  };

  const handleAddDomainEdit = (keyId, domain) => {
    const d = domain.trim().toLowerCase();
    if (!d) return;
    const key = keys.find((k) => k.id === keyId);
    if (!key) return;
    if (key.allowed_domains.includes(d)) return;
    updateKeyDomains(keyId, [...key.allowed_domains, d]);
  };

  const handleRemoveDomainEdit = (keyId, domain) => {
    const key = keys.find((k) => k.id === keyId);
    if (!key) return;
    updateKeyDomains(keyId, key.allowed_domains.filter((d) => d !== domain));
  };

  const updateKeyDomains = async (keyId, domains) => {
    try {
      await apiRequest(`/api-keys/${keyId}`, { method: 'PUT', body: { allowed_domains: domains } });
      await load();
      toast({ title: 'Domains updated' });
    } catch (e) {
      toast({ title: 'Failed to update domains', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  const copyKey = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const isExpired = (key) => key.expires_at && new Date(key.expires_at) < new Date();

  return (
    <Layout role="admin" title="API Keys">
      <div className="max-w-4xl space-y-5 animate-fade-in">
        {/* Info banner */}
        <div className="bg-card rounded-2xl p-5 shadow-card flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">API Key Management</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Create API keys for external apps and services. Each key is restricted to specific domains —
              only requests from those domains will be accepted. Keys are shown once at creation; store them securely.
            </p>
          </div>
        </div>

        {/* Create button */}
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Create API Key
          </Button>
        </div>

        {/* Key list */}
        {loading ? (
          <div className="bg-card rounded-2xl shadow-card p-6 space-y-4">
            {[1, 2].map((i) => <div key={i} className="h-20 shimmer rounded-xl" />)}
          </div>
        ) : keys.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-card p-8 text-center">
            <KeyRound className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No API keys yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key, i) => (
              <div
                key={key.id}
                className="bg-card rounded-2xl shadow-card p-4 animate-slide-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold">{key.name}</h3>
                      {key.is_active ? (
                        <Badge className="bg-green-100 text-green-700 border-transparent">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                      {isExpired(key) && (
                        <Badge variant="destructive">Expired</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
                        {key.key_prefix}
                      </code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleActive(key)}
                      title={key.is_active ? 'Deactivate' : 'Activate'}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Power className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleRotate(key)}
                      title="Rotate key"
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <RefreshCw className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(key.id)}
                      title="Delete key"
                      className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>

                {/* Domains */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Allowed Domains</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {key.allowed_domains.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">No domains — key will be rejected</span>
                    ) : (
                      key.allowed_domains.map((domain) => (
                        <span
                          key={domain}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium"
                        >
                          {domain}
                          <button
                            onClick={() => handleRemoveDomainEdit(key.id, domain)}
                            className="hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <DomainAddInput onAdd={(d) => handleAddDomainEdit(key.id, d)} />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border/60">
                  <div>
                    <p className="text-xs text-muted-foreground">Requests</p>
                    <p className="text-sm font-semibold">{key.total_requests || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last used</p>
                    <p className="text-sm font-semibold">{key.last_used_at ? formatDate(key.last_used_at) : 'Never'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expires</p>
                    <p className="text-sm font-semibold">{formatDate(key.expires_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key with domain restrictions. The full key will be shown once after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="key-name" className="text-xs">Name</Label>
              <Input
                id="key-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Mobile App, Partner Integration"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Allowed Domains</Label>
              <p className="text-xs text-muted-foreground">
                Only requests from these domains will be accepted. Use <code className="bg-muted px-1 rounded">*</code> to allow all (not recommended).
              </p>
              <div className="flex gap-2">
                <Input
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDomain(); } }}
                  placeholder="example.com"
                />
                <Button type="button" variant="outline" onClick={handleAddDomain}>Add</Button>
              </div>
              {form.allowed_domains.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.allowed_domains.map((domain) => (
                    <span
                      key={domain}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium"
                    >
                      {domain}
                      <button onClick={() => handleRemoveDomain(domain)} className="hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rate-limit" className="text-xs">Rate limit (req/min)</Label>
                <Input
                  id="rate-limit"
                  type="number"
                  value={form.rate_limit_per_minute}
                  onChange={(e) => setForm({ ...form, rate_limit_per_minute: e.target.value })}
                  placeholder="60"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expires" className="text-xs">Expires (optional)</Label>
                <Input
                  id="expires"
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? 'Creating…' : 'Create Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Key Result Dialog */}
      <Dialog open={!!newKeyResult} onOpenChange={(open) => !open && setNewKeyResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy this key now. For security, it will not be shown again.
            </DialogDescription>
          </DialogHeader>

          {newKeyResult && (
            <div className="space-y-4 py-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Store this key in a secure secret manager (e.g. vault, AWS Secrets Manager).
                  You can rotate it later if compromised, but the old key will stop working immediately.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={newKeyResult.full_key || ''}
                    className="font-mono text-xs"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyKey(newKeyResult.full_key)}
                    className="shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Usage Example</Label>
                <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
{`curl -H "X-API-Key: ${newKeyResult.full_key?.substring(0, 15)}…" \\
     -H "Origin: https://${newKeyResult.allowed_domains?.[0] || 'yourdomain.com'}" \\
     ${API_BASE_URL}/doctors`}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setNewKeyResult(null)}>I've saved the key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

/** Small inline input for adding a domain to an existing key */
function DomainAddInput({ onAdd }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex gap-2 mt-1.5">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (value.trim()) { onAdd(value); setValue(''); }
          }
        }}
        placeholder="Add domain…"
        className="h-8 text-xs"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => { if (value.trim()) { onAdd(value); setValue(''); } }}
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
