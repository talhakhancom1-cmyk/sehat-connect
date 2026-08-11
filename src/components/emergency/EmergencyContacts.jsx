import React, { useState } from 'react';
import { Phone, MessageSquare, Plus, Trash2, X, User, UserPlus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const RELATIONS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Family Doctor', 'Friend', 'Other'];

export default function EmergencyContacts({ contacts, onAdd, onDelete, loading, addingContact, deletingContactId }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', relation: RELATIONS[0], phone: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: 'Name and phone are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await onAdd(form);
      setForm({ name: '', relation: RELATIONS[0], phone: '' });
      setAdding(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Phone className="w-4 h-4 text-primary" />
          Emergency Contacts
        </h3>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:bg-primary/10 px-2.5 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={submit} className="mb-3 p-3 rounded-lg border border-border bg-secondary/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> New Contact</span>
            <button type="button" onClick={() => setAdding(false)} className="p-1 rounded-md hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value })} className="px-3 py-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+92 300 1234567" className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <button type="submit" disabled={saving || addingContact} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{(saving || addingContact) ? 'Saving…' : 'Save Contact'}</button>
        </form>
      )}

      <div className="space-y-2">
        {loading && [1, 2].map(i => <div key={i} className="h-14 rounded-md bg-secondary/30 shimmer" />)}
        {!loading && contacts.length === 0 && (
          <div className="py-6 text-center">
            <User className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No contacts yet. Add people to alert in an emergency.</p>
          </div>
        )}
        {!loading && contacts.map(contact => {
          const initials = contact.name.split(' ').map(n => n[0]).join('').slice(0, 2);
          return (
            <div key={contact.id} className="flex items-center gap-3 p-3 rounded-md bg-secondary/20 hover:bg-secondary/40 transition-colors group">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary border border-border flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{contact.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">{contact.relation} · {contact.phone}</p>
              </div>
              <div className="flex items-center gap-1">
                <a href={`tel:${contact.phone}`} className="p-2 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"><Phone className="w-3.5 h-3.5" /></a>
                <a href={`sms:${contact.phone}`} className="p-2 rounded-md bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"><MessageSquare className="w-3.5 h-3.5" /></a>
                <button onClick={() => onDelete(contact)} disabled={deletingContactId === contact.id} className="p-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}