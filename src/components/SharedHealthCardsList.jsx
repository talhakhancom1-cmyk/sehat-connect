import React, { useEffect, useState } from 'react';
import { HeartPulse, Pill, AlertTriangle, Syringe, ShieldAlert, Baby } from 'lucide-react';
import { getIncomingSharedData } from '@/lib/familyAccess';
import EmptyState from '@/components/EmptyState';
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

export default function SharedHealthCardsList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getIncomingSharedData(['healthCards']);
        setItems(data.healthCards || []);
      } catch { setItems([]); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <div key={i} className="h-28 rounded-2xl shimmer" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-card">
        <EmptyState
          icon={HeartPulse}
          title="No shared health cards yet"
          description="When a family member shares their health cards with you, they'll appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base">Shared with you</h2>
        <span className="text-sm text-primary font-medium">{items.length} cards</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((card, i) => {
          const Icon = typeIcon[card.card_type] || HeartPulse;
          const color = typeColor[card.card_type] || 'bg-slate-50 text-slate-600';
          return (
            <div key={card.id} className="rounded-2xl bg-card border border-border shadow-card overflow-hidden animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{card.title}</p>
                    <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                      {card.card_type} card · from {card._delegatorName}
                    </p>
                  </div>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}