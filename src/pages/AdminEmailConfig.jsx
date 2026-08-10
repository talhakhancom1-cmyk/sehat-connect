import React, { useEffect, useState, useCallback, useRef } from 'react';
import Layout from '@/components/Layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Mail,
  Save,
  Send,
  Power,
  Server,
  Settings2,
  Loader2,
  CheckCircle2,
  AlertCircle,
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

const PROVIDER_PRESETS = [
  { name: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false },
  { name: 'Gmail (SSL)', host: 'smtp.gmail.com', port: 465, secure: true },
  { name: 'Outlook/Hotmail', host: 'smtp.office365.com', port: 587, secure: false },
  { name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, secure: false, username: 'apikey' },
  { name: 'Mailgun', host: 'smtp.mailgun.org', port: 587, secure: false },
  { name: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false },
  { name: 'Zoho', host: 'smtp.zoho.com', port: 587, secure: false },
  { name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 587, secure: false },
];

const FEATURE_LABELS = {
  enable_password_reset: 'Password Reset',
  enable_signup_otp: 'Signup OTP',
  enable_appointment_reminders: 'Appointment Reminders',
  enable_medication_reminders: 'Medication Reminders',
  enable_consent_notifications: 'Consent Notifications',
  enable_chat_notifications: 'Chat Notifications',
  enable_payment_receipts: 'Payment Receipts',
};

export default function AdminEmailConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null);

  // Direct DOM refs for the critical SMTP fields — bypasses any React state
  // issues (stale closures, re-renders resetting form, etc.) by reading
  // values straight from the input elements at save time.
  const smtpHostRef = useRef(null);
  const smtpUsernameRef = useRef(null);
  const smtpPasswordRef = useRef(null);
  const fromEmailRef = useRef(null);

  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: false,
    smtp_username: '',
    smtp_password: '',
    from_email: '',
    from_name: 'Sehat Connect',
    reply_to: '',
    enable_password_reset: true,
    enable_signup_otp: false,
    enable_appointment_reminders: true,
    enable_medication_reminders: true,
    enable_consent_notifications: true,
    enable_chat_notifications: true,
    enable_payment_receipts: true,
    is_active: true,
  });

  // Ref to always have the latest form state in callbacks (avoids stale closures).
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  // Guard to prevent load() from running more than once on mount.
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/email-config');
      if (data.configured) {
        setConfig(data);
        setForm({
          smtp_host: data.smtp_host || '',
          smtp_port: data.smtp_port || 587,
          smtp_secure: data.smtp_secure ?? false,
          smtp_username: data.smtp_username || '',
          smtp_password: '', // never pre-fill password
          from_email: data.from_email || '',
          from_name: data.from_name || 'Sehat Connect',
          reply_to: data.reply_to || '',
          enable_password_reset: data.enable_password_reset ?? true,
          enable_signup_otp: data.enable_signup_otp ?? false,
          enable_appointment_reminders: data.enable_appointment_reminders ?? true,
          enable_medication_reminders: data.enable_medication_reminders ?? true,
          enable_consent_notifications: data.enable_consent_notifications ?? true,
          enable_chat_notifications: data.enable_chat_notifications ?? true,
          enable_payment_receipts: data.enable_payment_receipts ?? true,
          is_active: data.is_active ?? true,
        });
        setTestEmail(data.from_email || '');
      } else {
        setConfig(null);
      }
    } catch (e) {
      toast({ title: 'Failed to load email config', description: String(e?.message || e), variant: 'destructive' });
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

  const applyPreset = (preset) => {
    setForm((f) => ({
      ...f,
      smtp_host: preset.host,
      smtp_port: preset.port,
      smtp_secure: preset.secure,
      smtp_username: preset.username || f.smtp_username,
    }));
    toast({ title: `Preset applied: ${preset.name}` });
  };

  const save = async () => {
    // Read critical fields directly from the DOM inputs — this bypasses
    // any React state issues (stale closures, re-renders, etc.) by getting
    // the exact value the user sees on screen.
    const host = (smtpHostRef.current?.value || '').trim();
    const username = (smtpUsernameRef.current?.value || '').trim();
    const fromEmail = (fromEmailRef.current?.value || '').trim();
    const password = (smtpPasswordRef.current?.value || '').trim();
    const f = formRef.current;

    console.log('[SMTP] save called', {
      dom: { host, username, fromEmail, password: password ? '(set)' : '(empty)' },
      state: { host: f.smtp_host, username: f.smtp_username, fromEmail: f.from_email },
    });

    if (!host || !username || !fromEmail) {
      console.error('[SMTP] validation failed:', { host: !!host, username: !!username, fromEmail: !!fromEmail });
      toast({ title: 'Missing fields', description: 'SMTP host, username, and from email are required', variant: 'destructive' });
      return;
    }
    if (!config && !password) {
      toast({ title: 'Password required', description: 'SMTP password is required on first setup', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Build payload from form state for non-critical fields, but override
      // the critical ones with DOM-read values.
      const payload = {
        ...f,
        smtp_host: host,
        smtp_username: username,
        from_email: fromEmail,
      };
      if (password) {
        payload.smtp_password = password;
      } else if (config) {
        delete payload.smtp_password;
      }
      console.log('[SMTP] sending payload to backend:', { ...payload, smtp_password: payload.smtp_password ? '(set)' : '(omitted)' });
      await apiRequest('/email-config', { method: 'POST', body: payload });
      toast({ title: 'Email settings saved' });
      await load();
    } catch (e) {
      console.error('[SMTP] save failed:', e);
      toast({ title: 'Failed to save', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail) {
      toast({ title: 'Email address required', variant: 'destructive' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiRequest('/email-config/test', { method: 'POST', body: { to: testEmail } });
      setTestResult({ success: true, message: result.message });
      toast({ title: 'Test email sent!', description: `Check ${testEmail}` });
    } catch (e) {
      setTestResult({ success: false, message: String(e?.message || e) });
      toast({ title: 'Test email failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const deactivate = async () => {
    if (!confirm('Deactivate email sending? All email notifications will stop.')) return;
    try {
      await apiRequest('/email-config', { method: 'DELETE' });
      toast({ title: 'Email config deactivated' });
      await load();
    } catch (e) {
      toast({ title: 'Failed', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  return (
    <Layout role="admin" title="Email / SMTP">
      <div className="max-w-3xl space-y-5 animate-fade-in">
        {/* Info banner */}
        <div className="bg-card rounded-2xl p-5 shadow-card flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Email / SMTP Configuration</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Configure an SMTP server to send transactional emails — password resets, signup OTPs,
              appointment reminders, medication reminders, and payment receipts. Use a provider preset
              or enter custom SMTP settings.
            </p>
            {config && (
              <div className="flex items-center gap-2 mt-2">
                {config.is_active ? (
                  <Badge className="bg-green-100 text-green-700 border-transparent">Active</Badge>
                ) : (
                  <Badge variant="destructive">Inactive</Badge>
                )}
                <span className="text-xs text-muted-foreground">{config.smtp_host}:{config.smtp_port}</span>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="bg-card rounded-2xl shadow-card p-6 space-y-4">
            <div className="h-10 shimmer rounded-xl" />
            <div className="h-10 shimmer rounded-xl" />
            <div className="h-10 shimmer rounded-xl" />
          </div>
        ) : (
          <>
            {/* Provider presets */}
            <div className="bg-card rounded-2xl p-5 shadow-card space-y-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Quick Setup (Provider Presets)</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* SMTP Settings */}
            <div className="bg-card rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">SMTP Server</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="smtp_host" className="text-xs">SMTP Host</Label>
                  <Input
                    id="smtp_host"
                    ref={smtpHostRef}
                    value={form.smtp_host}
                    onChange={(e) => update('smtp_host', e.target.value)}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp_port" className="text-xs">Port</Label>
                  <Input
                    id="smtp_port"
                    type="number"
                    value={form.smtp_port}
                    onChange={(e) => update('smtp_port', e.target.value)}
                    placeholder="587"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp_username" className="text-xs">Username</Label>
                  <Input
                    id="smtp_username"
                    ref={smtpUsernameRef}
                    value={form.smtp_username}
                    onChange={(e) => update('smtp_username', e.target.value)}
                    placeholder="your@email.com or apikey"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp_password" className="text-xs">
                    Password {config && <span className="text-muted-foreground">(leave blank to keep current)</span>}
                  </Label>
                  <Input
                    id="smtp_password"
                    ref={smtpPasswordRef}
                    type="password"
                    value={form.smtp_password}
                    onChange={(e) => update('smtp_password', e.target.value)}
                    placeholder={config ? '•••••••• (unchanged)' : 'Enter password'}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={form.smtp_secure}
                  onCheckedChange={(v) => update('smtp_secure', v)}
                />
                <span className="text-xs">Use SSL/TLS (port 465 typically uses this)</span>
              </div>
            </div>

            {/* From Address */}
            <div className="bg-card rounded-2xl p-5 shadow-card space-y-4">
              <h3 className="text-sm font-semibold">Sender Identity</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="from_email" className="text-xs">From Email</Label>
                  <Input
                    id="from_email"
                    ref={fromEmailRef}
                    type="email"
                    value={form.from_email}
                    onChange={(e) => update('from_email', e.target.value)}
                    placeholder="noreply@yourdomain.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="from_name" className="text-xs">From Name</Label>
                  <Input
                    id="from_name"
                    value={form.from_name}
                    onChange={(e) => update('from_name', e.target.value)}
                    placeholder="Sehat Connect"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reply_to" className="text-xs">Reply-To (optional)</Label>
                <Input
                  id="reply_to"
                  type="email"
                  value={form.reply_to}
                  onChange={(e) => update('reply_to', e.target.value)}
                  placeholder="support@yourdomain.com"
                />
              </div>
            </div>

            {/* Feature Toggles */}
            <div className="bg-card rounded-2xl p-5 shadow-card space-y-3">
              <h3 className="text-sm font-semibold">Email Features</h3>
              <p className="text-xs text-muted-foreground">Toggle which emails are sent via SMTP.</p>
              <div className="space-y-2">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between py-1.5">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={form[key]}
                      onCheckedChange={(v) => update(key, v)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Master toggle */}
            <div className="bg-card rounded-2xl p-5 shadow-card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Email Active</h3>
                  <p className="text-xs text-muted-foreground">Master switch — disables all emails when off.</p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => update('is_active', v)}
                />
              </div>
            </div>

            {/* Save + Test */}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Settings'}
              </Button>

              {config && (
                <Button onClick={deactivate} variant="outline" className="text-destructive hover:text-destructive flex items-center gap-1.5">
                  <Power className="w-4 h-4" />
                  Deactivate
                </Button>
              )}
            </div>

            {/* Test Email */}
            {config && (
              <div className="bg-card rounded-2xl p-5 shadow-card space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Send className="w-4 h-4 text-muted-foreground" />
                  Send Test Email
                </h3>
                <p className="text-xs text-muted-foreground">
                  Verify your SMTP settings work by sending a test email.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="test@example.com"
                  />
                  <Button onClick={sendTest} disabled={testing} variant="outline" className="shrink-0 flex items-center gap-1.5">
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {testing ? 'Sending…' : 'Send Test'}
                  </Button>
                </div>
                {testResult && (
                  <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
