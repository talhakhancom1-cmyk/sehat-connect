import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode, Search, ShieldCheck, AlertTriangle, Eye, Clock } from 'lucide-react';

export default function VerifyCard() {
  const [tokenInput, setTokenInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) { setTokenInput(t); verify(t); }
  }, []);

  const verify = async (tokenStr) => {
    const tok = (tokenStr || tokenInput).trim();
    if (!tok) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await base44.functions.invoke('verifyHealthCardToken', { token: tok });
      setResult(res.data);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Verification failed';
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <Layout role="doctor">
      <div className="max-w-xl mx-auto space-y-5 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><QrCode className="w-5 h-5 text-primary" /> Verify Health Card</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Enter or paste the access code shown by a patient's QR</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="Paste token…" className="bg-transparent text-sm outline-none flex-1 font-mono" />
          </div>
          <Button onClick={() => verify()} disabled={loading || !tokenInput.trim()}>{loading ? 'Verifying…' : 'Verify'}</Button>
        </div>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-destructive">Cannot verify card</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden animate-slide-up">
            <div className="p-4 border-b border-border flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div>
              <div>
                <p className="font-semibold text-sm">{result.card.title}</p>
                <p className="text-[11px] text-muted-foreground capitalize">{result.card.card_type} card · {result.card.patient_name}</p>
              </div>
            </div>

            {result.card.data_snapshot && Object.keys(result.card.data_snapshot).length > 0 && (
              <div className="p-4 space-y-2">
                {Object.entries(result.card.data_snapshot).map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-3 text-sm">
                    <span className="text-muted-foreground w-32 shrink-0">{k}</span>
                    <span className="font-medium text-foreground">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-3 border-t border-border bg-secondary/30 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {result.token.view_count}/{result.token.max_views} views</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Expires {result.token.expires_at ? new Date(result.token.expires_at).toLocaleString() : '—'}</span>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}