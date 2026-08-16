import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { checkRecordAccess, daysUntilExpiry } from '@/lib/recordAccess';
import { FileText, Lock, ShieldCheck, Clock, X, FileImage } from 'lucide-react';
import { cn, authFileUrl, formatAppointmentDate } from '@/lib/utils';
import { formatRecordDate } from '@/lib/recordDate';
import { categoryLabel } from '@/lib/healthCategories';

const categoryColors = {
  allergies_intolerances: 'text-rose-600 bg-rose-100',
  current_medications: 'text-indigo-600 bg-indigo-100',
  previous_medications: 'text-indigo-600 bg-indigo-100',
  diagnoses: 'text-purple-600 bg-purple-100',
  laboratory_results: 'text-rose-600 bg-rose-100',
  imaging: 'text-blue-600 bg-blue-100',
  vaccinations: 'text-indigo-600 bg-indigo-100',
  procedures_surgeries: 'text-orange-600 bg-orange-100',
  mental_health: 'text-pink-600 bg-pink-100',
  reproductive_health: 'text-fuchsia-600 bg-fuchsia-100',
  infectious_disease: 'text-red-600 bg-red-100',
  genetic_information: 'text-amber-600 bg-amber-100',
  wearable_data: 'text-teal-600 bg-teal-100',
  medication_adherence: 'text-cyan-600 bg-cyan-100',
  uploaded_documents: 'text-slate-600 bg-slate-100',
  chat_clinical_notes: 'text-emerald-600 bg-emerald-100',
};

export default function PatientRecordsDialog({ patientName, patientId, doctorId, open, onClose }) {
  const [access, setAccess] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !patientName || !doctorId) return;
    loadData();
  }, [open, patientName, patientId, doctorId]);

  const loadData = async () => {
    setLoading(true);
    setRecords([]);
    try {
      const accessResult = await checkRecordAccess(doctorId, patientName);
      setAccess(accessResult);

      if (accessResult.hasAccess) {
        // Query by patient_id when available (robust against name mismatches),
        // falling back to patient_name for legacy records.
        const recordFilter = patientId ? { patient_id: patientId } : { patient_name: patientName };
        const recs = await base44.entities.MedicalRecord.filter(recordFilter, '-date', 50);
        // When access is via consent, enforce category scoping
        const consentCategories = accessResult.accessReason === 'consent' ? accessResult.consent?.categories : null;
        const scoped = consentCategories?.length
          ? recs.filter(r => consentCategories.includes(r.category))
          : recs;
        setRecords(scoped);
        const patientUserId = accessResult.activeAppointment?.patient_id || accessResult.consent?.patient_id || patientName;
        try {
          await base44.entities.AuditEvent.create({
            actor_user_id: doctorId,
            actor_role: 'doctor',
            action: 'record_view',
            target_type: 'MedicalRecord',
            target_id: 'bulk_view',
            patient_id: patientUserId,
            detail: `Viewed ${scoped.length} record(s) for ${patientName}${consentCategories?.length ? ` (scoped to ${consentCategories.length} consented categor${consentCategories.length > 1 ? 'ies' : 'y'})` : ''}`,
          });
        } catch (e) { console.error('Audit log failed', e); }
      }
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-t-2xl sm:rounded-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold">{patientName}</h2>
            <p className="text-xs text-muted-foreground">Medical Records</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />)}
            </div>
          ) : access?.hasAccess ? (
            <div className="space-y-3">
              {/* Access Active Banner */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 text-green-700 text-xs font-medium border border-green-200">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {access.accessReason === 'consent' && access.consent ? (
                  <span>
                    Access via consent — {access.consent.categories?.length || 0} categor{access.consent.categories?.length === 1 ? 'y' : 'ies'} shared
                    {access.consent.expires_at ? ` · expires ${new Date(access.consent.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ' · no expiry'}
                  </span>
                ) : (
                  <span>Record access active{daysUntilExpiry(access.activeAppointment?.appointment_date) != null ? ` — expires in ${daysUntilExpiry(access.activeAppointment?.appointment_date)} days` : ''}</span>
                )}
              </div>

              {/* Consent category chips */}
              {access.accessReason === 'consent' && access.consent?.categories?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {access.consent.categories.map(cat => (
                    <span key={cat} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium border border-primary/20">{categoryLabel(cat)}</span>
                  ))}
                </div>
              )}

              {/* Records List */}
              {records.length > 0 ? (
                <div className="space-y-2">
                  {records.map(rec => {
                    const catColor = categoryColors[rec.category] || 'text-muted-foreground bg-secondary';
                    return (
                      <div key={rec.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/20 transition-all">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', catColor)}>
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{rec.title}</p>
                          <p className="text-xs text-muted-foreground">{categoryLabel(rec.category)} · {formatRecordDate(rec)}</p>
                          {rec.doctor_name && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">Dr. {rec.doctor_name}</p>
                          )}
                        </div>
                        {rec.file_url && (
                          <a
                            href={authFileUrl(rec.file_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary font-medium hover:underline shrink-0"
                          >
                            View
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileImage className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No medical records found for this patient</p>
                </div>
              )}
            </div>
          ) : access?.hasExpired ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-7 h-7 text-amber-600" />
              </div>
              <p className="text-sm font-bold text-foreground">Record access expired</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
                Access to {patientName}'s records expired 7 days after your last appointment.
                Book a new appointment to regain access.
              </p>
            </div>
          ) : (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                <Lock className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-bold text-foreground">No approved appointment</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
                You need a confirmed or completed appointment with {patientName} to view their medical records.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}