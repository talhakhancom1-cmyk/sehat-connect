import React from 'react';
import { Star, MapPin, BadgeCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import DoctorAvatar from '@/components/DoctorAvatar';

export default function DoctorCard({ doctor, onBook, index = 0 }) {
  const rating = doctor.rating || 0;
  const modes = doctor.availability_modes || ['video'];

  const modeBadges = {
    video: 'Video', physical: 'In-person', home: 'Home', chat: 'Chat', audio: 'Audio',
  };

  return (
    <Link
      to={`/doctors/${doctor.id}`}
      className="group rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:shadow-soft hover:-translate-y-0.5 animate-slide-up block"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-3">
        <DoctorAvatar name={doctor.full_name} imageUrl={doctor.image_url} size="lg" isOnline={doctor.is_online} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold truncate">{doctor.full_name}</h3>
            {doctor.verification_status === 'verified' && (
              <BadgeCheck className="w-4 h-4 text-primary shrink-0 animate-pop-in" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-primary font-medium">{doctor.specialty}</p>
            {doctor.rating >= 4.5 && doctor.total_reviews >= 10 && (
              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Top Rated
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{doctor.city}</span>
            <span>·</span>
            <span>{doctor.experience_years} yrs exp</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-center gap-0.5 animate-pop-in">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-bold">{Number(rating || 0).toFixed(1)}</span>
          </div>
          <p className="text-sm font-bold mt-0.5">Rs {Number(doctor.consultation_fee || 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
        <div className="flex flex-wrap items-center gap-1.5">
          {modes.slice(0, 4).map((mode) => (
            <span key={mode} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground">
              {modeBadges[mode] || mode}
            </span>
          ))}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBook?.(doctor); }}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all"
        >
          Book Now
        </button>
      </div>
    </Link>
  );
}