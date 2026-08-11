import React from 'react';
import { cn } from '@/lib/utils';

export default function SpecialtyTile({ name, icon: Icon, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 group active:scale-95 transition-transform"
    >
      <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center transition-all group-hover:shadow-soft', color)}>
        <Icon className="w-6 h-6" strokeWidth={2} />
      </div>
      <span className="text-xs font-medium text-foreground text-center leading-tight">{name}</span>
    </button>
  );
}