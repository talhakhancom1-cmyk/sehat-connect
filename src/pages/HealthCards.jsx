import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import HealthCardForm from '@/components/HealthCardForm';
import HealthCardTokenQR from '@/components/HealthCardTokenQR';
import StatusBadge from '@/components/StatusBadge';
import FamilyShareModal from '@/components/FamilyShareModal';
import FamilyAuthorizations from '@/components/FamilyAuthorizations';
import SharedHealthCardsList from '@/components/SharedHealthCardsList';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { issueCardToken, revokeToken, buildVerifyUrl } from '@/lib/healthCard';
import { HeartPulse, Pill, AlertTriangle, Syringe, ShieldAlert, Baby, Plus, QrCode, Copy, Ban, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const typeIcon = {
  emergency: HeartPulse, medication: Pill, allergy: AlertTriangle, vaccination: Syringe,
  chronic: ShieldAlert, maternal: HeartPulse, child: Baby, ips: HeartPulse,
};
const typeColor = {
  emergency: 'bg-rose-50 text-rose-600', medication: 'bg-indigo-50 text-indigo-600',
  allergy: 'bg-amber-50 text-amber-600', vaccination: 'bg-teal-50 text-teal-600',
  chronic: 'bg-purple-50 text-purple-600', maternal: 'bg-pink-50 text-pink-600',
  child: 'bg-blue-50 text-blue-600', ips: 'bg-slate-50 text-slate-600',
};

export default function HealthCards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cards, setCards] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeCard, setActiveCard] = useState(null);
  const [expiry, setExpiry] = useState(1);
  const [maxViews, setMaxViews] = useState(1);
  const [issuing, setIssuing] = useState(false);
  const [tab, setTab] = useState('mine');
  const [showShare, setShowShare] = useState(false);
  const [authKey, setAuthKey] = useState(0);

  const load = async () => {
    try {
      const list = await base44.entities.HealthCard.filter({ patient_id: user.id }, '-created_date', 50);
      setCards(list);
      const tks = await base44.entities.HealthCardToken.filter({ created_by_id_ref: user.id }, '-created_date', 50);
      setTokens(tks);
    } catch { setCards([]); setTokens([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const createCard = async (data) => {
    try {
      await base44.entities.HealthCard.create(data);
      await base44.entities.AuditEvent.create({ actor_user_id: user.id, actor_role: 'patient', action: 'health_card_create', target_type: 'HealthCard', target_id: 'pending', patient_id: user.id, detail: `Created card "${data.title}"` });
      toast({ title: 'Health card created' });
      setShowForm(false);
      load();
    } catch (e) {
      toast({ title: 'Could not create card', description: e.message, variant: 'destructive' });
    }
  };

  const revokeCard = async (card) => {
    if (!confirm(`Revoke "${card.title}"? This disables the card and all its tokens.`)) return;
    await base44.entities.HealthCard.update(card.id, { status: 'revoked' });
    toast({ title: 'Card revoked' });
    load();
  };

  const issueToken = async (card) => {
    setIssuing(true);
    try {
      await issueCardToken(card, user.id, { expiresInHours: Number(expiry), maxViews: Number(maxViews) });
      toast({ title: 'Access QR generated' });
      load();
    } catch (e) {
      toast({ title: 'Could not generate QR', description: e.message, variant: 'destructive' });
    } finally { setIssuing(false); }
  };

  const onRevokeToken = async (id) => {
    await revokeToken(id);
    toast({ title: 'Token revoked' });
    load();
  };

  const copyLink = (url) => {
    navigator.clipboard?.writeText(url);
    toast({ title: 'Link copied' });
  };

  const tokensForCard = (cardId) => tokens.filter((t) => t.card_id === cardId && t.status === 'active');

  return (
    <Layout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Health Cards</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Digital cards you can share via time-limited QR or with family</p>
          </div>
          {tab === 'mine' && (
            <button onClick={() => setShowForm(true)} className="px-3 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all">
              <Plus className="w-4 h-4" /> New card
            </button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-card rounded-full border border-border w-fit">
          <button
            onClick={() => setTab('mine')}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-semibold transition-all',
              tab === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            My Cards
          </button>
          <button
            onClick={() => setTab('shared')}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-semibold transition-all',
              tab === 'shared' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Shared with me
          </button>
        </div>

        {tab === 'shared' ? (
          <SharedHealthCardsList />
        ) : (
          <>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <div key={i} className="h-28 rounded-2xl shimmer" />)}
              </div>
            ) : cards.length === 0 ? (
              <div className="bg-card rounded-2xl shadow-card">
                <EmptyState icon={HeartPulse} title="No health cards yet" description="Create an emergency, medication, or allergy card and share it securely." actionLabel="Create card" onAction={() => setShowForm(true)} />
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowShare(true)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-primary/10 text-primary border border-primary/20 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/20 active:scale-95 transition-all"
                >
                  <Share2 className="w-4 h-4" /> Share cards with family
                </button>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cards.map((card) => {
                    const Icon = typeIcon[card.card_type] || HeartPulse;
                    const color = typeColor[card.card_type] || 'bg-slate-50 text-slate-600';
                    const activeToks = tokensForCard(card.id);
                    return (
                      <div key={card.id} className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{card.title}</p>
                              <p className="text-[11px] text-muted-foreground capitalize mt-0.5">{card.card_type} card</p>
                            </div>
                            <StatusBadge status={card.status} />
                          </div>

                          {card.data_snapshot && Object.keys(card.data_snapshot).length > 0 && (
                            <div className="mt-3 space-y-1.5">
                              {Object.entries(card.data_snapshot).slice(0, 4).map(([k, v]) => (
                                <div key={k} className="flex items-baseline gap-2 text-xs">
                                  <span className="text-muted-foreground shrink-0">{k}:</span>
                                  <span className="font-medium text-foreground">{String(v)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                            {card.lock_screen_accessible && <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">Lock screen</span>}
                            {card.qr_enabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">QR</span>}
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground capitalize">Auth: {card.requires_auth}</span>
                          </div>
                        </div>

                        {card.status === 'active' && (
                          <div className="border-t border-border p-3 bg-secondary/30">
                            <button onClick={() => setActiveCard(activeCard?.id === card.id ? null : card)} className="w-full flex items-center justify-center gap-2 text-sm font-medium text-primary py-1.5">
                              <QrCode className="w-4 h-4" /> {activeCard?.id === card.id ? 'Hide QR' : 'Generate access QR'}
                            </button>

                            {activeCard?.id === card.id && (
                              <div className="mt-3 p-3 rounded-xl bg-card border border-border space-y-3">
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-muted-foreground">Expires in</label>
                                  <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-8 rounded-lg border border-input bg-background px-2 text-xs">
                                    <option value={1}>1 hour</option>
                                    <option value={24}>24 hours</option>
                                    <option value={168}>7 days</option>
                                  </select>
                                  <label className="text-xs text-muted-foreground ml-2">Max views</label>
                                  <input type="number" min={1} max={20} value={maxViews} onChange={(e) => setMaxViews(e.target.value)} className="h-8 w-16 rounded-lg border border-input bg-background px-2 text-xs" />
                                </div>
                                <button onClick={() => issueToken(card)} disabled={issuing} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                                  {issuing ? 'Generating…' : 'Generate QR'}
                                </button>

                                {activeToks.length > 0 && (
                                  <div className="space-y-2 pt-2 border-t border-border/60">
                                    {activeToks.map((t) => (
                                      <div key={t.id} className="rounded-lg border border-border p-2">
                                        <div className="flex items-start gap-3">
                                          <HealthCardTokenQR value={buildVerifyUrl(t.token)} size={96} />
                                          <div className="flex-1 min-w-0 text-[11px] space-y-1">
                                            <p className="text-muted-foreground">Views: {t.view_count || 0}/{t.max_views}</p>
                                            <p className="text-muted-foreground">Expires: {t.expires_at ? new Date(t.expires_at).toLocaleString() : '—'}</p>
                                            <div className="flex items-center gap-1.5 pt-1">
                                              <button onClick={() => copyLink(buildVerifyUrl(t.token))} className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-foreground hover:bg-secondary/70"><Copy className="w-3 h-3" /> Link</button>
                                              <button onClick={() => onRevokeToken(t.id)} className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20"><Ban className="w-3 h-3" /> Revoke</button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {card.status === 'active' && (
                          <button onClick={() => revokeCard(card)} className="w-full py-2 text-[11px] text-muted-foreground hover:text-destructive border-t border-border/60">
                            Revoke card
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <FamilyAuthorizations key={authKey} scope="health_card_view" />
          </>
        )}
      </div>

      {showForm && <HealthCardForm patientId={user?.id} patientName={user?.full_name} onSave={createCard} onClose={() => setShowForm(false)} />}
      {showShare && (
        <FamilyShareModal
          scope="health_card_view"
          onClose={() => setShowShare(false)}
          onGranted={() => { setShowShare(false); setAuthKey((k) => k + 1); }}
        />
      )}
    </Layout>
  );
}