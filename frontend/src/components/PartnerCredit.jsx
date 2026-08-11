import React from 'react';
import { cn } from '@/lib/utils';

/**
 * WebFrat — Technical Development Partner credit.
 * Shown across the app (auth screens, desktop sidebar, app footer).
 */
export default function PartnerCredit({ className, align = 'left' }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 select-none',
        align === 'center' && 'items-center text-center',
        className
      )}
      role="contentinfo"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Technical Development Partner
      </p>
      <p className="text-sm font-semibold text-foreground">WebFrat</p>
      <p className="text-[10px] text-muted-foreground">
        Engineering &amp; Delivery Partner for Eco Health Cloud
      </p>
    </div>
  );
}