import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import RecordTimeline from '@/components/RecordTimeline';
import EmptyState from '@/components/EmptyState';
import { useAuth } from '@/lib/AuthContext';
import { recordAudit } from '@/lib/audit';
import { CalendarClock, FileText, X, ExternalLink } from 'lucide-react';
import { formatRecordDate } from '@/lib/recordDate';
import { categoryIcon } from '@/components/RecordTimeline';
import { cn, authFileUrl } from '@/lib/utils';

export default function RecordTimelinePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const load = async () => {
    try {
      const data = await base44.entities.MedicalRecord.filter({ patient_id: user.id }, '-date', 500);
      setRecords(data);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };

  const openRecord = async (rec) => {
    setOpen(rec);
    await recordAudit({
      action: 'record_view',
      target_type: 'MedicalRecord',
      target_id: rec.id,
      patient_id: user.id,
      detail: `Patient viewed record "${rec.title}"`,
    });
  };

  const { icon: Icon, color } = open ? categoryIcon(open.category) : { icon: FileText, color: '' };

  return (
    <Layout title="Health Timeline">
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-bold text-base">Your longitudinal record</h2>
            <p className="text-xs text-muted-foreground">{records.length} entries, newest first</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}
          </div>
        ) : records.length ? (
          <RecordTimeline records={records} onOpen={openRecord} />
        ) : (
          <EmptyState icon={FileText} title="No records yet" description="Import or upload a record to start your timeline." />
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="bg-card rounded-2xl w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="border-b border-border p-4 flex items-center justify-between">
              <h3 className="font-bold">Record details</h3>
              <button onClick={() => setOpen(null)} className="p-2 rounded-full hover:bg-secondary"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold">{open.title}</p>
                  <p className="text-xs text-muted-foreground">{open.category} · {formatRecordDate(open)}</p>
                </div>
              </div>
              {open.doctor_name && <Detail label="Doctor" value={open.doctor_name} />}
              {open.source_hospital && <Detail label="Source" value={open.source_hospital} />}
              {open.hospital && !open.source_hospital && <Detail label="Hospital" value={open.hospital} />}
              {open.notes && <Detail label="Notes" value={open.notes} />}
              {open.file_url && (
                <a href={authFileUrl(open.file_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                  <ExternalLink className="w-4 h-4" /> Open file
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Detail({ label, value }) {
  return (
    <div className="p-3 rounded-xl bg-secondary/30">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}