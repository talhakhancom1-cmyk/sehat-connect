import React from 'react';
import { cn } from '@/lib/utils';

export default function HealthMetricCard({ icon: Icon, label, value, unit, color, index = 0 }) {
  return (
    <div
      className="bg-card rounded-2xl p-4 border border-border shadow-card hover:shadow-soft hover:-translate-y-0.5 transition-all duration-200 animate-slide-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', color)}>
        <Icon className="w-4 h-4" strokeWidth={2} />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-2xl font-bold text-foreground tracking-tight">{value}</span>
        {unit && <span className="text-xs text-muted-foreground font-medium">{unit}</span>}
      </div>
    </div>
  );
}