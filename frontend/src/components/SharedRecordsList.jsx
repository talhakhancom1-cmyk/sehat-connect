import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { getIncomingSharedData } from '@/lib/familyAccess';
import EmptyState from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { formatRecordDate } from '@/lib/recordDate';
import { categoryLabel } from '@/lib/healthCategories';

const categoryColors = {
  allergies_intolerances: 'text-rose-600 bg-rose-50',
  current_medications: 'text-indigo-600 bg-indigo-50',
  previous_medications: 'text-indigo-600 bg-indigo-50',
  diagnoses: 'text-purple-600 bg-purple-50',
  laboratory_results: 'text-rose-600 bg-rose-50',
  imaging: 'text-blue-600 bg-blue-50',
  vaccinations: 'text-indigo-600 bg-indigo-50',
  procedures_surgeries: 'text-orange-600 bg-orange-50',
  mental_health: 'text-pink-600 bg-pink-50',
  reproductive_health: 'text-fuchsia-600 bg-fuchsia-50',
  infectious_disease: 'text-red-600 bg-red-50',
  genetic_information: 'text-amber-600 bg-amber-50',
  wearable_data: 'text-teal-600 bg-teal-50',
  medication_adherence: 'text-cyan-600 bg-cyan-50',
  uploaded_documents: 'text-slate-600 bg-slate-50',
  chat_clinical_notes: 'text-emerald-600 bg-emerald-50',
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
                    From {rec._delegatorName} · {formatRecordDate(rec)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', catColor)}>
                  {categoryLabel(rec.category)}
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