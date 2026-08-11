import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import DoctorAvatar from '@/components/DoctorAvatar';
import StatusBadge from '@/components/StatusBadge';
import { recordAudit } from '@/lib/audit';
import { Search, ShieldCheck, Ban, RotateCcw, Stethoscope, FileText, X, ExternalLink } from 'lucide-react';
import { cn, authFileUrl } from '@/lib/utils';

const tabs = ['all', 'pending', 'verified', 'suspended'];

export default function AdminDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await base44.entities.Doctor.filter({}, '-created_at', 500);
      setDoctors(data);
    } catch { setDoctors([]); }
    finally { setLoading(false); }
  };

  const [reviewing, setReviewing] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  const handleVerify = async (doctor, status) => {
    if (verifyingId) return;
    setVerifyingId(doctor.id);
    try {
      await base44.entities.Doctor.update(doctor.id, { verification_status: status });
      await recordAudit({
        action: status === 'verified' ? 'doctor_verify' : status === 'suspended' ? 'doctor_suspend' : 'doctor_verify',
        target_type: 'Doctor',
        target_id: doctor.id,
        detail: `Admin set verification to ${status}`,
      });
      setReviewing(null);
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setVerifyingId(null);
    }
  };

  const filtered = doctors.filter(d => {
    if (tab !== 'all' && d.verification_status !== tab) return false;
    if (search && !d.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <Layout role="admin" title="Doctor Management">
      <div className="space-y-4 animate-fade-in">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border max-w-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search doctors…" className="bg-transparent text-sm outline-none flex-1" />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap transition-all active:scale-95', tab === t ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground border border-border hover:bg-secondary')}>
              {t}
              <span className="ml-1.5 text-[10px] opacity-70">{t === 'all' ? doctors.length : doctors.filter(d => d.verification_status === t).length}</span>
            </button>
          ))}
        </div>

        {/* Doctor List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-2xl shimmer" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((doc, i) => (
              <div key={doc.id} className="bg-card rounded-2xl p-4 shadow-card hover:shadow-soft transition-all animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-start gap-3">
                  <DoctorAvatar name={doc.full_name} imageUrl={doc.image_url} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-sm truncate">{doc.full_name}</p>
                      <StatusBadge status={doc.verification_status} />
                    </div>
                    <p className="text-xs text-primary mt-0.5">{doc.specialty}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span>{doc.city}</span>
                      <span>·</span>
                      <span>{doc.experience_years} yrs</span>
                      <span>·</span>
                      <span>Rs {Number(doc.consultation_fee || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
                  <button onClick={() => setReviewing(doc)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/80 active:scale-95 transition-all">
                    <FileText className="w-3.5 h-3.5" /> Review
                  </button>
                  {doc.verification_status !== 'verified' && (
                    <button onClick={() => handleVerify(doc, 'verified')} disabled={verifyingId === doc.id} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50">
                      <ShieldCheck className="w-3.5 h-3.5" /> {verifyingId === doc.id ? 'Verifying…' : 'Verify'}
                    </button>
                  )}
                  {doc.verification_status !== 'suspended' && (
                    <button onClick={() => handleVerify(doc, 'suspended')} disabled={verifyingId === doc.id} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-100 text-xs font-semibold hover:bg-red-100 active:scale-95 transition-all disabled:opacity-50">
                      <Ban className="w-3.5 h-3.5" /> {verifyingId === doc.id ? 'Suspending…' : 'Suspend'}
                    </button>
                  )}
                  {doc.verification_status !== 'pending' && (
                    <button onClick={() => handleVerify(doc, 'pending')} disabled={verifyingId === doc.id} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground text-xs font-semibold hover:bg-secondary/80 active:scale-95 transition-all ml-auto disabled:opacity-50">
                      <RotateCcw className="w-3.5 h-3.5" /> {verifyingId === doc.id ? 'Resetting…' : 'Reset'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-card p-8 text-center">
            <Stethoscope className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No doctors found</p>
          </div>
        )}
      </div>

      {/* Review dialog */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setReviewing(null)}>
          <div className="bg-card rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <h3 className="font-bold text-base">Review verification</h3>
              <button onClick={() => setReviewing(null)} className="p-2 rounded-full hover:bg-secondary active:scale-95 transition-all">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <DoctorAvatar name={reviewing.full_name} imageUrl={reviewing.image_url} size="lg" />
                <div>
                  <p className="font-bold text-sm">{reviewing.full_name}</p>
                  <p className="text-xs text-primary">{reviewing.specialty}</p>
                  <div className="mt-1"><StatusBadge status={reviewing.verification_status} /></div>
                </div>
              </div>

              <DetailRow label="PMDC number" value={reviewing.pmdc_number || reviewing.license_number || '—'} />
              <DetailRow label="Email" value={reviewing.email || '—'} />
              <DetailRow label="City" value={reviewing.city || '—'} />
              <DetailRow label="Phone" value={reviewing.phone || '—'} />
              <DetailRow label="Experience" value={`${reviewing.experience_years || 0} years`} />
              <DetailRow label="Consultation fee" value={`Rs ${Number(reviewing.consultation_fee || 0).toLocaleString()}`} />

              {reviewing.verification_notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Doctor notes</p>
                  <p className="text-sm bg-secondary/50 rounded-xl p-3">{reviewing.verification_notes}</p>
                </div>
              )}

              <DocLink label="License document" url={reviewing.license_document_url} />
              <DocLink label="Identity document" url={reviewing.identity_document_url} />

              <div className="flex items-center gap-2 pt-2">
                <button onClick={() => handleVerify(reviewing, 'verified')} disabled={verifyingId === reviewing.id} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50">
                  <ShieldCheck className="w-4 h-4" /> {verifyingId === reviewing.id ? 'Verifying…' : 'Verify doctor'}
                </button>
                <button onClick={() => handleVerify(reviewing, 'suspended')} disabled={verifyingId === reviewing.id} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100 text-sm font-semibold hover:bg-red-100 active:scale-95 transition-all disabled:opacity-50">
                  <Ban className="w-4 h-4" /> {verifyingId === reviewing.id ? 'Suspending…' : 'Suspend'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right truncate">{value}</span>
    </div>
  );
}

function DocLink({ label, url }) {
  if (!url) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileText className="w-4 h-4" /> {label}: not provided
      </div>
    );
  }
  return (
    <a href={authFileUrl(url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
      <FileText className="w-4 h-4" /> {label} <ExternalLink className="w-3.5 h-3.5" />
    </a>
  );
}