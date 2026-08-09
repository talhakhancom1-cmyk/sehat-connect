import React from 'react';
import { cn } from '@/lib/utils';
import { Clock, CalendarCheck, Activity, CheckCircle2, XCircle, ShieldCheck, Ban, CircleDot, AlertCircle, BadgeCheck } from 'lucide-react';

const statusConfig = {
  pending: { label: 'Pending', class: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  confirmed: { label: 'Upcoming', class: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: CalendarCheck },
  in_progress: { label: 'In Progress', class: 'bg-blue-100 text-blue-700 border-blue-200', icon: Activity },
  completed: { label: 'Completed', class: 'bg-gray-100 text-gray-600 border-gray-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', class: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  rejected: { label: 'Rejected', class: 'bg-red-100 text-red-700 border-red-200', icon: Ban },
  verified: { label: 'Verified', class: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: ShieldCheck },
  suspended: { label: 'Suspended', class: 'bg-red-100 text-red-700 border-red-200', icon: Ban },
  active: { label: 'Active', class: 'bg-green-100 text-green-700 border-green-200', icon: CircleDot },
  expired: { label: 'Expired', class: 'bg-gray-100 text-gray-600 border-gray-200', icon: AlertCircle },
  unpaid: { label: 'Unpaid', class: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertCircle },
  paid: { label: 'Paid', class: 'bg-green-100 text-green-700 border-green-200', icon: BadgeCheck },
};

export default function StatusBadge({ status, className }) {
  const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-600 border-gray-200', icon: CircleDot };
  const Icon = config.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border', config.class, className)}>
      <Icon className="w-3 h-3 shrink-0" strokeWidth={2.5} />
      {config.label}
    </span>
  );
}