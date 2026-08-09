import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { checkRecordAccess, daysUntilExpiry } from '@/lib/recordAccess';
import {
  X, FileText, Lock, ShieldCheck, Clock, FileImage, Pill, CalendarDays,
  Stethoscope, Activity, User, ChevronRight
} from 'lucide-react';
import { cn, authFileUrl } from '@/lib/utils';

const categoryColors = {
  'Blood Report': 'text-rose-600 bg-rose-100',
  'X-Ray': 'text-blue-600 bg-blue-100',
  'MRI': 'text-purple-600 bg-purple-100',
  'CT Scan': 'text-amber-600 bg-amber-100',
  'ECG': 'text-red-600 bg-red-100',
  'Ultrasound': 'text-cyan-600 bg-cyan-100',
  'Vaccination': 'text-indigo-600 bg-indigo-100',
  'Prescription': 'text-indigo-600 bg-indigo-100',
  'Operation Report': 'text-orange-600 bg-orange-100',
  'Discharge Summary': 'text-teal-600 bg-teal-100',
};

const tabs = [
  { key: 'overview', label: 'Overview', icon: User },
  { key: 'records', label: 'Records', icon: FileText },
  { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
  { key: 'visits', label: 'Visit History', icon: CalendarDays },
];

export default function PatientOverviewDialog({ patientName, doctorId, appointments = [], open, onClose }) {
  const [access, setAccess] = useState(null);
  const [records, setRecords] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [patientAppts, setPatientAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (!open || !patientName || !doctorId) return;
    loadData();
  }, [open, patientName, doctorId]);

  const loadData = async () => {
    setLoading(true);
    setRecords([]);
    setPrescriptions([]);
    setPatientAppts([]);
    try {
      const accessResult = await checkRecordAccess(doctorId, patientName);
      setAccess(accessResult);

      if (accessResult.hasAccess) {
        const [recs, prescs, appts] = await Promise.all([
          base44.entities.MedicalRecord.filter({ patient_name: patientName }, '-date', 50),
          base44.entities.Prescription.filter({ patient_name: patientName }, '-date', 50),
          base44.entities.Appointment.filter({ patient_name: patientName }, '-appointment_date', 50),
        ]);
        setRecords(recs);
        setPrescriptions(prescs);
        setPatientAppts(appts);
      }
    } catch {
      setRecords([]);
      setPrescriptions([]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  // Derive patient info from appointments
  const patientAppt = patientAppts[0] || appointments.find(a => a.patient_name === patientName);
  const patientAge = patientAppt?.patient_age;
  const patientGender = patientAppt?.patient_gender;
  const totalVisits = patientAppts.length || appointments.filter(a => a.patient_name === patientName).length;
  const lastVisit = patientAppts[0]?.appointment_date || appointments.find(a => a.patient_name === patientName)?.appointment_date;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-t-2xl sm:rounded-2xl border border-border w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-base font-bold text-primary">
                {patientName?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'P'}
              </span>
            </div>
            <div>
              <h2 className="text-base font-bold">{patientName}</h2>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                {patientAge && <span>{patientAge}y</span>}
                {patientGender && <><span>·</span><span className="capitalize">{patientGender}</span></>}
                {totalVisits > 0 && <><span>·</span><span>{totalVisits} {totalVisits === 1 ? 'visit' : 'visits'}</span></>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
            </div>
          ) : access?.hasAccess ? (
            <>
              {/* Access banner */}
              <div className="px-5 pt-3 shrink-0">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 text-green-700 text-xs font-medium border border-green-200">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Record access active — expires in {daysUntilExpiry(access.activeAppointment?.appointment_date)} days</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 px-5 pt-3 border-b border-border shrink-0 overflow-x-auto scrollbar-thin">
                {tabs.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap',
                        tab === t.key
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
                {tab === 'overview' && (
                  <OverviewTab
                    patientName={patientName}
                    patientAge={patientAge}
                    patientGender={patientGender}
                    records={records}
                    prescriptions={prescriptions}
                    appointments={patientAppts.length ? patientAppts : appointments.filter(a => a.patient_name === patientName)}
                    onTabChange={setTab}
                  />
                )}
                {tab === 'records' && <RecordsTab records={records} />}
                {tab === 'prescriptions' && <PrescriptionsTab prescriptions={prescriptions} />}
                {tab === 'visits' && <VisitsTab appointments={patientAppts.length ? patientAppts : appointments.filter(a => a.patient_name === patientName)} />}
              </div>
            </>
          ) : access?.hasExpired ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-7 h-7 text-amber-600" />
                </div>
                <p className="text-sm font-bold text-foreground">Record access expired</p>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Access to {patientName}'s records expired 7 days after your last appointment.
                  Book a new appointment to regain access.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-foreground">No approved appointment</p>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
                  You need a confirmed or completed appointment with {patientName} to view their medical history.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ patientName, patientAge, patientGender, records, prescriptions, appointments, onTabChange }) {
  const stats = [
    { label: 'Total Visits', value: appointments.length, icon: CalendarDays, color: 'text-blue-600 bg-blue-100' },
    { label: 'Records', value: records.length, icon: FileText, color: 'text-rose-600 bg-rose-100' },
    { label: 'Prescriptions', value: prescriptions.length, icon: Pill, color: 'text-indigo-600 bg-indigo-100' },
    { label: 'Last Visit', value: appointments[0]?.appointment_date || '—', icon: Activity, color: 'text-teal-600 bg-teal-100' },
  ];

  const recentRecords = records.slice(0, 3);
  const recentPrescriptions = prescriptions.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-border p-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', s.color)}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-lg font-bold leading-none">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recent prescriptions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Recent Prescriptions</p>
          {prescriptions.length > 3 && (
            <button onClick={() => onTabChange('prescriptions')} className="text-[11px] text-primary font-medium flex items-center gap-0.5 hover:underline">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {recentPrescriptions.length > 0 ? (
          <div className="space-y-2">
            {recentPrescriptions.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-primary/20 transition-all">
                <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                  <Pill className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.diagnosis || 'Prescription'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.medications?.length || 0} meds · {p.date}
                  </p>
                </div>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'
                )}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 rounded-xl border border-dashed border-border">
            <Pill className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1" />
            <p className="text-xs text-muted-foreground">No prescriptions yet</p>
          </div>
        )}
      </div>

      {/* Recent records */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Recent Records</p>
          {records.length > 3 && (
            <button onClick={() => onTabChange('records')} className="text-[11px] text-primary font-medium flex items-center gap-0.5 hover:underline">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {recentRecords.length > 0 ? (
          <div className="space-y-2">
            {recentRecords.map(rec => {
              const catColor = categoryColors[rec.category] || 'text-muted-foreground bg-secondary';
              return (
                <div key={rec.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-primary/20 transition-all">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', catColor)}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{rec.title}</p>
                    <p className="text-[11px] text-muted-foreground">{rec.category} · {rec.date}</p>
                  </div>
                  {rec.file_url && (
                    <a href={authFileUrl(rec.file_url)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary font-medium hover:underline shrink-0">
                      View
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4 rounded-xl border border-dashed border-border">
            <FileImage className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1" />
            <p className="text-xs text-muted-foreground">No medical records found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordsTab({ records }) {
  if (records.length === 0) {
    return (
      <div className="text-center py-10">
        <FileImage className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No medical records found for this patient</p>
      </div>
    );
  }
  return (
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
              <p className="text-xs text-muted-foreground">{rec.category} · {rec.date}</p>
              {rec.doctor_name && <p className="text-[10px] text-muted-foreground mt-0.5">Dr. {rec.doctor_name}</p>}
              {rec.hospital && <p className="text-[10px] text-muted-foreground">{rec.hospital}</p>}
            </div>
            {rec.file_url && (
              <a href={authFileUrl(rec.file_url)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-medium hover:underline shrink-0">
                View
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PrescriptionsTab({ prescriptions }) {
  if (prescriptions.length === 0) {
    return (
      <div className="text-center py-10">
        <Pill className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No prescriptions found for this patient</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {prescriptions.map(p => (
        <div key={p.id} className="rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-secondary/50 border-b border-border">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">{p.diagnosis || 'Prescription'}</p>
                <p className="text-[10px] text-muted-foreground">Dr. {p.doctor_name} · {p.date}</p>
              </div>
            </div>
            <span className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full',
              p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'
            )}>
              {p.status}
            </span>
          </div>
          {/* Body */}
          <div className="p-3">
            {/* Medications */}
            {p.medications?.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {p.medications.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Pill className="w-3 h-3 text-indigo-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">{m.name}</span>
                      {m.dosage && <span className="text-muted-foreground"> · {m.dosage}</span>}
                      {m.frequency && <span className="text-muted-foreground"> · {m.frequency}</span>}
                      {m.duration && <span className="text-muted-foreground"> · {m.duration}</span>}
                      {m.instructions && <p className="text-[10px] text-muted-foreground italic mt-0.5">{m.instructions}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Notes & follow-up */}
            {(p.notes || p.follow_up) && (
              <div className="pt-2 border-t border-border space-y-1">
                {p.notes && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold">Notes:</span> {p.notes}
                  </p>
                )}
                {p.follow_up && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold">Follow-up:</span> {p.follow_up}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function VisitsTab({ appointments }) {
  if (appointments.length === 0) {
    return (
      <div className="text-center py-10">
        <CalendarDays className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No visit history found</p>
      </div>
    );
  }
  const statusColors = {
    pending: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-indigo-100 text-indigo-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return (
    <div className="space-y-2">
      {appointments.map(a => (
        <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/20 transition-all">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold capitalize">{a.type} consultation</p>
            <p className="text-[11px] text-muted-foreground">
              {a.appointment_date} · {a.time_slot}
            </p>
            {a.reason && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{a.reason}</p>}
          </div>
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full capitalize shrink-0', statusColors[a.status] || 'bg-secondary text-muted-foreground')}>
            {a.status?.replace('_', ' ')}
          </span>
        </div>
      ))}
    </div>
  );
}