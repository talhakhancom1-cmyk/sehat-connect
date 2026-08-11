import React from 'react';
import { cn } from '@/lib/utils';

export default function Skeleton({ className }) {
  return <div className={cn('shimmer rounded-xl', className)} />;
}