import React from 'react';
import { FileText, FileImage, Pill, Syringe, Stethoscope, HeartPulse, ShieldAlert, FileCheck, Brain, Baby, Dna, Coins, Activity, Watch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRecordDate, monthKey } from '@/lib/recordDate';
import { categoryLabel } from '@/lib/healthCategories';

const categoryMeta = {
  'allergies_intolerances': { icon: ShieldAlert, color: 'text-rose-600 bg-rose-50' },
  'current_medications': { icon: Pill, color: 'text-violet-600 bg-violet-50' },
  'previous_medications': { icon: Pill, color: 'text-violet-600 bg-violet-50' },
  'diagnoses': { icon: Stethoscope, color: 'text-red-600 bg-red-50' },
  'laboratory_results': { icon: HeartPulse, color: 'text-rose-600 bg-rose-50' },
  'imaging': { icon: FileImage, color: 'text-blue-600 bg-blue-50' },
  'vaccinations': { icon: Syringe, color: 'text-indigo-600 bg-indigo-50' },
  'procedures_surgeries': { icon: Stethoscope, color: 'text-orange-600 bg-orange-50' },
  'mental_health': { icon: Brain, color: 'text-fuchsia-600 bg-fuchsia-50' },
  'reproductive_health': { icon: Baby, color: 'text-pink-600 bg-pink-50' },
  'infectious_disease': { icon: ShieldAlert, color: 'text-red-600 bg-red-50' },
  'genetic_information': { icon: Dna, color: 'text-cyan-600 bg-cyan-50' },
  'wearable_data': { icon: Watch, color: 'text-cyan-600 bg-cyan-50' },
  'medication_adherence': { icon: Activity, color: 'text-green-600 bg-green-50' },
  'uploaded_documents': { icon: FileCheck, color: 'text-slate-600 bg-slate-50' },
  'chat_clinical_notes': { icon: FileText, color: 'text-teal-600 bg-teal-50' },
};

export function categoryIcon(category) {
  return categoryMeta[category] || { icon: FileText, color: 'text-muted-foreground bg-secondary' };
}

export default function RecordTimeline({ records, onOpen }) {
  if (!records.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
        <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No records on your timeline yet.</p>
      </div>
    );
  }

  // Group by month, newest first
  const groups = {};
  records.forEach(r => {
    const k = monthKey(r.date);
    (groups[k] = groups[k] || []).push(r);
  });
  const months = Object.keys(groups);

  return (
    <div className="space-y-8">
      {months.map(month => (
        <div key={month}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{month}</h3>
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground">{groups[month].length}</span>
          </div>
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
            <div className="space-y-3">
              {groups[month].map(rec => {
                const { icon: Icon, color } = categoryIcon(rec.category);
                return (
                  <button
                    key={rec.id}
                    onClick={() => onOpen?.(rec)}
                    className="relative w-full text-left group"
                  >
                    <span className="absolute -left-[18px] top-3 w-3.5 h-3.5 rounded-full bg-card border-2 border-primary/40 group-hover:border-primary transition-colors" />
                    <div className="rounded-xl border border-border bg-card p-3 hover:border-primary/20 hover:shadow-soft transition-all">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', color)}>
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate">{rec.title}</p>
                            <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">{formatRecordDate(rec)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {categoryLabel(rec.category)}
                            {rec.doctor_name ? ` · ${rec.doctor_name}` : ''}
                            {rec.source_hospital ? ` · ${rec.source_hospital}` : rec.hospital ? ` · ${rec.hospital}` : ''}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            {rec.is_draft && <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[9px] font-medium border border-amber-200">Draft</span>}
                            {rec.provenance && rec.provenance !== 'patient-entered' && (
                              <span className="px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground text-[9px] font-medium capitalize">{rec.provenance.replace('-', ' ')}</span>
                            )}
                            {rec.verification_status === 'clinician_verified' && (
                              <span className="px-1.5 py-0.5 rounded-md bg-green-50 text-green-600 text-[9px] font-medium border border-green-200">Verified</span>
                            )}
                            {rec.file_url && <span className="text-[10px] text-primary font-medium">View file →</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}