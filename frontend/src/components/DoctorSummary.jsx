import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Star, ClipboardList, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const barColors = ['bg-primary', 'bg-blue-500', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500'];

export default function DoctorSummary({ doctorId, doctorName, appointments = [], loading = false }) {
  const [reviews, setReviews] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    if (!doctorId) return;
    let active = true;
    (async () => {
      try {
        const [revs, meds] = await Promise.all([
          base44.entities.Review.filter({ doctor_id: doctorId }, '-date', 200).catch(() => []),
          base44.entities.Prescription.filter({ doctor_name: doctorName }, '-date', 200).catch(() => []),
        ]);
        if (!active) return;
        setReviews(revs);
        setPrescriptions(meds);
      } catch {
        /* keep defaults */
      } finally {
        if (active) setLoadingExtra(false);
      }
    })();
    return () => { active = false; };
  }, [doctorId, doctorName]);

  // Monthly consultations (current calendar month, completed)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyConsults = appointments.filter(
    (a) => a.status === 'completed' && new Date(a.appointment_date) >= monthStart
  ).length;

  // Ratings
  const totalReviews = reviews.length;
  const avgRating = totalReviews
    ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / totalReviews
    : 0;
  const dist = [5, 4, 3, 2, 1].map((star) => reviews.filter((r) => r.rating === star).length);
  const maxDist = Math.max(...dist, 1);

  // Most common diagnoses (aggregated from prescriptions)
  const diagCounts = {};
  prescriptions.forEach((p) => {
    const d = (p.diagnosis || '').trim();
    if (d) diagCounts[d] = (diagCounts[d] || 0) + 1;
  });
  const topDiagnoses = Object.entries(diagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxDiag = Math.max(...topDiagnoses.map((d) => d[1]), 1);

  const isLoading = loading || loadingExtra;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        Practice Summary
      </h3>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-md bg-secondary/30 text-center">
          {isLoading ? (
            <div className="h-6 shimmer rounded" />
          ) : (
            <p className="text-xl font-bold font-mono text-primary">{monthlyConsults}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Monthly Consultations</p>
        </div>
        <div className="p-3 rounded-md bg-secondary/30 text-center">
          {isLoading ? (
            <div className="h-6 shimmer rounded" />
          ) : (
            <p className="text-xl font-bold font-mono text-amber-400 flex items-center justify-center gap-1">
              <Star className="w-4 h-4 fill-amber-400" /> {Number(avgRating || 0).toFixed(1)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Average Rating</p>
        </div>
        <div className="p-3 rounded-md bg-secondary/30 text-center">
          {isLoading ? (
            <div className="h-6 shimmer rounded" />
          ) : (
            <p className="text-xl font-bold font-mono text-primary">{totalReviews}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Total Reviews</p>
        </div>
      </div>

      {/* Rating distribution */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Star className="w-3 h-3 text-amber-400" /> Rating Distribution
        </p>
        <div className="space-y-1.5">
          {dist.map((count, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-3 font-mono">{5 - i}</span>
              <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(count / maxDist) * 100}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground w-5 text-right font-mono">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Most common diagnoses */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <ClipboardList className="w-3 h-3 text-primary" /> Most Common Diagnoses
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 shimmer rounded" />
            ))}
          </div>
        ) : topDiagnoses.length > 0 ? (
          <div className="space-y-2">
            {topDiagnoses.map(([diag, count], i) => (
              <div key={diag}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium truncate pr-2">{diag}</span>
                  <span className="text-muted-foreground font-mono shrink-0">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', barColors[i % barColors.length])}
                    style={{ width: `${(count / maxDiag) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">No diagnoses recorded yet</p>
        )}
      </div>
    </div>
  );
}