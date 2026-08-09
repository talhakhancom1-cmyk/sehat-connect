import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { getIncomingSharedData } from '@/lib/familyAccess';
import EmptyState from '@/components/EmptyState';
import { cn } from '@/lib/utils';

const categoryColors = {
  'Blood Report': 'text-rose-600 bg-rose-50',
  'X-Ray': 'text-blue-600 bg-blue-50',
  'MRI': 'text-indigo-600 bg-indigo-50',
  'CT Scan': 'text-amber-600 bg-amber-50',
  'ECG': 'text-red-600 bg-red-50',
  'Ultrasound': 'text-teal-600 bg-teal-50',
  'Vaccination': 'text-indigo-600 bg-indigo-50',
  'Prescription': 'text-indigo-600 bg-indigo-50',
  'Operation Report': 'text-orange-600 bg-orange-50',
  'Discharge Summary': 'text-teal-600 bg-teal-50',
};

export default function SharedRecordsList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getIncomingSharedData(['records']);
        setItems(data.records || []);
      } catch { setItems([]); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl shimmer" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-card">
        <EmptyState
          icon={FileText}
          title="No shared records yet"
          description="When a family member shares their medical records with you, they'll appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base">Shared with you</h2>
        <span className="text-sm text-primary font-medium">{items.length} records</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((rec, i) => {
          const catColor = categoryColors[rec.category] || 'text-muted-foreground bg-secondary';
          return (
            <div
              key={rec.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-card animate-slide-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', catColor)}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{rec.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    From {rec._delegatorName} · {rec.date}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', catColor)}>
                  {rec.category}
                </span>
                {rec.file_url && (
                  <a href={rec.file_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary font-medium hover:underline">
                    View
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}