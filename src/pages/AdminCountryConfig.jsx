import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { Globe, Plus, X, Save, MapPin, Stethoscope, Shield, Check, Pencil } from 'lucide-react';

export default function AdminCountryConfig() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // a config object or 'new'
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [tagInput, setTagInput] = useState({ cities: '', specialties: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.CountryConfig.list('-created_date', 100);
      setConfigs(data);
    } finally { setLoading(false); }
  };

  const openEdit = (cfg) => {
    setEditing(cfg || {
      country: '',
      country_name: '',
      language: 'en',
      languages: ['en'],
      timezone: '',
      currency: '',
      currency_symbol: '',
      cities: [],
      specialties: [],
      regulation_notes: '',
      consent_default_expiry_hours: 24,
      age_of_majority: 18,
      sensitive_categories: [],
      is_active: true,
    });
    setDraft(cfg ? { ...cfg } : {
      country: '',
      country_name: '',
      language: 'en',
      languages: ['en'],
      timezone: '',
      currency: '',
      currency_symbol: '',
      cities: [],
      specialties: [],
      regulation_notes: '',
      consent_default_expiry_hours: 24,
      age_of_majority: 18,
      sensitive_categories: [],
      is_active: true,
    });
  };

  const closeEdit = () => { setEditing(null); setDraft(null); setTagInput({ cities: '', specialties: '' }); };

  const addTag = (field, value) => {
    const v = value.trim();
    if (!v) return;
    if (draft[field]?.includes(v)) return;
    setDraft({ ...draft, [field]: [...(draft[field] || []), v] });
  };
  const removeTag = (field, v) => setDraft({ ...draft, [field]: (draft[field] || []).filter(x => x !== v) });

  const onTagKey = (field, e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(field, tagInput[field]);
      setTagInput({ ...tagInput, [field]: '' });
    }
  };

  const save = async () => {
    if (!draft.country || !draft.currency || !draft.timezone) return;
    setSaving(true);
    try {
      if (draft.id) {
        await base44.entities.CountryConfig.update(draft.id, draft);
      } else {
        await base44.entities.CountryConfig.create(draft);
      }
      await load();
      closeEdit();
    } finally { setSaving(false); }
  };

  const toggleActive = async (cfg) => {
    await base44.entities.CountryConfig.update(cfg.id, { is_active: !cfg.is_active });
    load();
  };

  return (
    <Layout role="admin" title="Country Configuration">
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Manage country-specific settings: currencies, cities, specialties, consent defaults and sensitive categories.</p>
          </div>
          <button onClick={() => openEdit(null)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all">
            <Plus className="w-4 h-4" /> Add country
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-card shimmer" />)}
          </div>
        ) : configs.length === 0 ? (
          <EmptyState icon={Globe} title="No country configs yet" description="Add your first country configuration to drive currencies, cities and specialties." actionLabel="Add country" onAction={() => openEdit(null)} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {configs.map(cfg => (
              <div key={cfg.id} className="bg-card rounded-2xl shadow-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{cfg.country_name || cfg.country}</p>
                      <p className="text-xs text-muted-foreground">{cfg.country} · {cfg.currency} {cfg.currency_symbol} · {cfg.timezone}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${cfg.is_active ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'}`}>
                    {cfg.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Stat icon={MapPin} label="Cities" value={cfg.cities?.length || 0} />
                  <Stat icon={Stethoscope} label="Specialties" value={cfg.specialties?.length || 0} />
                  <Stat icon={Shield} label="Consent expiry" value={`${cfg.consent_default_expiry_hours || 0}h`} />
                  <Stat icon={Check} label="Age of majority" value={cfg.age_of_majority || 18} />
                </div>

                {cfg.sensitive_categories?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Sensitive categories</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cfg.sensitive_categories.map(c => <span key={c} className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium border border-amber-200">{c}</span>)}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => openEdit(cfg)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-secondary transition-all">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => toggleActive(cfg)} className="px-3 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-secondary transition-all">
                    {cfg.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      {editing && draft && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={closeEdit}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl border border-border w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-base font-bold">{draft.id ? 'Edit country' : 'Add country'}</h2>
                <p className="text-xs text-muted-foreground">Configuration drives validation across the app</p>
              </div>
              <button onClick={closeEdit} className="p-2 rounded-full hover:bg-secondary transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Country code (ISO)"><input value={draft.country} onChange={e => setDraft({ ...draft, country: e.target.value.toUpperCase() })} placeholder="PK" className={inputCls} /></Field>
                <Field label="Country name"><input value={draft.country_name || ''} onChange={e => setDraft({ ...draft, country_name: e.target.value })} placeholder="Pakistan" className={inputCls} /></Field>
                <Field label="Currency code"><input value={draft.currency || ''} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} placeholder="PKR" className={inputCls} /></Field>
                <Field label="Currency symbol"><input value={draft.currency_symbol || ''} onChange={e => setDraft({ ...draft, currency_symbol: e.target.value })} placeholder="Rs" className={inputCls} /></Field>
                <Field label="Timezone (IANA)"><input value={draft.timezone || ''} onChange={e => setDraft({ ...draft, timezone: e.target.value })} placeholder="Asia/Karachi" className={inputCls} /></Field>
                <Field label="Default language"><input value={draft.language || ''} onChange={e => setDraft({ ...draft, language: e.target.value })} placeholder="en" className={inputCls} /></Field>
                <Field label="Consent default expiry (hours)" type="number"><input type="number" value={draft.consent_default_expiry_hours ?? 24} onChange={e => setDraft({ ...draft, consent_default_expiry_hours: Number(e.target.value) })} className={inputCls} /></Field>
                <Field label="Age of majority" type="number"><input type="number" value={draft.age_of_majority ?? 18} onChange={e => setDraft({ ...draft, age_of_majority: Number(e.target.value) })} className={inputCls} /></Field>
              </div>

              <TagField label="Cities" hint="Press Enter to add" items={draft.cities} input={tagInput.cities} onInput={v => setTagInput({ ...tagInput, cities: v })} onKey={e => onTagKey('cities', e)} onAdd={() => { addTag('cities', tagInput.cities); setTagInput({ ...tagInput, cities: '' }); }} onRemove={v => removeTag('cities', v)} />
              <TagField label="Specialties" hint="Press Enter to add" items={draft.specialties} input={tagInput.specialties} onInput={v => setTagInput({ ...tagInput, specialties: v })} onKey={e => onTagKey('specialties', e)} onAdd={() => { addTag('specialties', tagInput.specialties); setTagInput({ ...tagInput, specialties: '' }); }} onRemove={v => removeTag('specialties', v)} />
              <TagField label="Sensitive categories" hint="Press Enter to add" items={draft.sensitive_categories} input={tagInput.sensitive_categories || ''} onInput={v => setTagInput({ ...tagInput, sensitive_categories: v })} onKey={e => onTagKey('sensitive_categories', e)} onAdd={() => { addTag('sensitive_categories', tagInput.sensitive_categories); setTagInput({ ...tagInput, sensitive_categories: '' }); }} onRemove={v => removeTag('sensitive_categories', v)} />

              <Field label="Regulation notes"><textarea value={draft.regulation_notes || ''} onChange={e => setDraft({ ...draft, regulation_notes: e.target.value })} rows={2} placeholder="Local regulatory notes…" className={inputCls} /></Field>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} className="w-4 h-4 rounded" />
                <span className="text-sm">Active</span>
              </label>
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-end gap-2 shrink-0">
              <button onClick={closeEdit} className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-all">Cancel</button>
              <button onClick={save} disabled={saving || !draft.country || !draft.currency || !draft.timezone} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 active:scale-95 transition-all">
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50";

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/60">
      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function TagField({ label, hint, items, input, onInput, onKey, onAdd, onRemove }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted-foreground">{label}</label>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-border bg-card min-h-[44px]">
        {(items || []).map(t => (
          <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
            {t}
            <button onClick={() => onRemove(t)} className="hover:text-primary/60"><X className="w-3 h-3" /></button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => onInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Add…"
          className="flex-1 min-w-[80px] bg-transparent text-sm focus:outline-none px-1"
        />
      </div>
    </div>
  );
}