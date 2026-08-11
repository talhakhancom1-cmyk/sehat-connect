import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({ label, value, unit, trend, icon: Icon, accent = false }) {
  const isUp = trend && trend > 0;

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-all shadow-card',
        accent
          ? 'bg-primary/5 border-primary/20'
          : 'bg-card border-border'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', accent ? 'bg-primary/15' : 'bg-secondary')}>
          {Icon && <Icon className={cn('w-4 h-4', accent ? 'text-primary' : 'text-muted-foreground')} strokeWidth={2} />}
        </div>
        {trend !== undefined && (
          <div className={cn('flex items-center gap-1 text-[11px] font-medium', isUp ? 'text-green-600' : 'text-destructive')}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight">
        {value}
        {unit && <span className="text-sm text-muted-foreground ml-1 font-normal">{unit}</span>}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}