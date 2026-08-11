import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import DoctorAvatar from '@/components/DoctorAvatar';
import BookingModal from '@/components/BookingModal';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import {
  ChevronLeft, Star, Users, Briefcase, MessageSquare, MapPin,
  GraduationCap, Languages, ShieldCheck, Zap,
  Video, Phone, Building2, Home as HomeIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

const typeIcons = { video: Video, audio: Phone, chat: MessageSquare, physical: Building2, home: HomeIcon };
const typeLabels = { video: 'Video Call', audio: 'Audio Call', chat: 'Chat', physical: 'In-person', home: 'Home Visit' };
const dayLabels = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export default function DoctorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isPatient, role } = useRole();
  const [doctor, setDoctor] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [doc, revs, schs, appts] = await Promise.all([
          base44.entities.Doctor.get(id).catch(() => null),
          base44.entities.Review.filter({ doctor_id: id }, '-date', 50).catch(() => []),
          base44.entities.Schedule.filter({ doctor_id: id }).catch(() => []),
          base44.entities.Appointment.filter({ doctor_id: id }, '-created_date', 100).catch(() => []),
        ]);
        setDoctor(doc);
        setReviews(revs);
        setSchedule(schs[0] || null);
        setAppointments(appts);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Compute badges from real data
  const isVerified = doctor?.verification_status === 'verified';
  const isTopRated = doctor?.rating >= 4.5 && doctor?.total_reviews >= 10;

  // Quick Responder: avg time from appointment creation to confirmation < 24h, min 3 data points
  const confirmedAppts = appointments.filter(a => a.status === 'confirmed');
  const responseTimes = confirmedAppts
    .filter(a => a.created_date && a.updated_date)
    .map(a => new Date(a.updated_date).getTime() - new Date(a.created_date).getTime());
  const avgResponseMs = responseTimes.length > 0
    ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
    : Infinity;
  const isQuickResponder = responseTimes.length >= 3 && avgResponseMs < 24 * 60 * 60 * 1000;

  const modes = doctor?.availability_modes || ['video'];
  const languages = doctor?.languages || [];
  const workingDays = doctor?.working_days || [];
  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 5);

  const handleConfirmBooking = async (bookingDetails) => {
    if (booking) return;
    setBooking(true);
    try {
      await base44.entities.Appointment.create({
        doctor_id: doctor.id,
        doctor_name: doctor.full_name,
        patient_id: user?.id,
        doctor_user_id: doctor.user_id,
        patient_name: user?.display_name || user?.full_name || 'Patient',
        appointment_date: bookingDetails.appointment_date,
        time_slot: bookingDetails.time_slot,
        type: bookingDetails.type,
        status: 'pending',
        consultation_fee: doctor.consultation_fee,
        payment_status: 'unpaid',
        reason: 'General consultation',
      });
      toast({ title: 'Appointment booked!', description: `Your appointment with ${doctor.full_name} is pending confirmation.` });
      setShowBooking(false);
    } catch (e) {
      toast({ title: 'Booking failed', description: 'Could not book the appointment. Please try again.', variant: 'destructive' });
      console.error(e);
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 animate-fade-in">
          <div className="h-32 rounded-2xl shimmer" />
          <div className="h-20 rounded-2xl shimmer" />
          <div className="h-40 rounded-2xl shimmer" />
        </div>
      </Layout>
    );
  }

  if (!doctor) {
    return (
      <Layout>
        <EmptyState icon={Users} title="Doctor not found" description="This doctor profile may have been removed." />
      </Layout>
    );
  }

  const stats = [
    { icon: Users, value: doctor.total_patients || 0, label: 'Patients' },
    { icon: Briefcase, value: `${doctor.experience_years || 0} yrs`, label: 'Experience' },
    { icon: MessageSquare, value: doctor.total_reviews || reviews.length, label: 'Reviews' },
    { icon: Star, value: Number(doctor.rating || 0).toFixed(1), label: 'Rating' },
  ];

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in pb-20">
        {/* Back Button */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {/* Doctor Header */}
        <div className="bg-card rounded-2xl p-5 shadow-card animate-slide-up">
          <div className="flex items-start gap-4">
            <DoctorAvatar name={doctor.full_name} imageUrl={doctor.image_url} size="xl" />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold">{doctor.full_name}</h1>
              <p className="text-sm text-primary font-medium">{doctor.specialty}</p>
              {doctor.sub_specialty && <p className="text-xs text-muted-foreground mt-0.5">{doctor.sub_specialty}</p>}
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span>{doctor.hospital || doctor.location || doctor.city}</span>
              </div>
            </div>
          </div>

          {/* Stat Badges */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className="flex flex-col items-center text-center p-2 rounded-xl bg-primary/5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-1">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm font-bold">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              );
            })}
          </div>

          {/* Conditional Badges — only shown if actually true */}
          {(isVerified || isTopRated || isQuickResponder) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {isVerified && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-600 animate-pop-in">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
              {isTopRated && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-600 animate-pop-in">
                  <Star className="w-3 h-3 fill-current" /> Top Rated
                </span>
              )}
              {isQuickResponder && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-green-50 text-green-600 animate-pop-in">
                  <Zap className="w-3 h-3" /> Quick Responder
                </span>
              )}
            </div>
          )}
        </div>

        {/* About */}
        {(doctor.bio || doctor.education || languages.length > 0) && (
          <div className="bg-card rounded-2xl p-5 shadow-card animate-slide-up" style={{ animationDelay: '60ms' }}>
            <h2 className="font-bold text-base mb-3">About</h2>
            {doctor.bio && <p className="text-sm text-muted-foreground leading-relaxed mb-3">{doctor.bio}</p>}
            <div className="space-y-2">
              {doctor.education && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-muted-foreground">{doctor.education}</span>
                </div>
              )}
              {languages.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Languages className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-muted-foreground">{languages.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Consultation Types & Fee */}
        <div className="bg-card rounded-2xl p-5 shadow-card animate-slide-up" style={{ animationDelay: '120ms' }}>
          <h2 className="font-bold text-base mb-3">Consultation Types</h2>
          <div className="flex flex-wrap gap-2">
            {modes.map(mode => {
              const Icon = typeIcons[mode] || Video;
              return (
                <div key={mode} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/50 text-sm">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="font-medium">{typeLabels[mode] || mode}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Consultation Fee</span>
            <span className="text-lg font-bold">Rs {Number(doctor.consultation_fee || 0).toLocaleString()}</span>
          </div>
        </div>

        {/* Availability */}
        <div className="bg-card rounded-2xl p-5 shadow-card animate-slide-up" style={{ animationDelay: '180ms' }}>
          <h2 className="font-bold text-base mb-3">Availability</h2>
          {workingDays.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {workingDays.map(day => (
                <span key={day} className="px-3 py-1.5 rounded-full bg-secondary/50 text-sm font-medium">
                  {dayLabels[day] || day}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Contact the doctor for availability.</p>
          )}
          {schedule?.break_start && schedule?.break_end && (
            <p className="text-xs text-muted-foreground mt-2">Break: {schedule.break_start} - {schedule.break_end}</p>
          )}
        </div>

        {/* Reviews */}
        <div className="bg-card rounded-2xl p-5 shadow-card animate-slide-up" style={{ animationDelay: '240ms' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base">Reviews ({reviews.length})</h2>
            {doctor.rating > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="text-sm font-bold">{Number(doctor.rating || 0).toFixed(1)}</span>
              </div>
            )}
          </div>
          {reviews.length > 0 ? (
            <div className="space-y-3">
              {displayedReviews.map((review, i) => (
                <div key={review.id || i} className="p-3 rounded-xl bg-secondary/30 animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">{(review.patient_name || 'A')[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{review.patient_name?.split(' ')[0] || 'Anonymous'}</p>
                        {review.is_verified && <p className="text-[10px] text-green-600">Verified visit</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <Star key={n} className={cn('w-3 h-3', n <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                      ))}
                    </div>
                  </div>
                  {review.comment && <p className="text-sm text-muted-foreground leading-relaxed">{review.comment}</p>}
                  {review.date && <p className="text-[10px] text-muted-foreground mt-1">{review.date}</p>}
                </div>
              ))}
              {reviews.length > 5 && !showAllReviews && (
                <button onClick={() => setShowAllReviews(true)} className="w-full py-2.5 rounded-xl text-sm font-medium text-primary hover:bg-primary/10 active:scale-95 transition-all">
                  See All Reviews ({reviews.length})
                </button>
              )}
            </div>
          ) : (
            <EmptyState icon={MessageSquare} title="No reviews yet" description="Reviews from patients will appear here" />
          )}
        </div>
      </div>

      {/* Sticky Book Button — patient-only, verified doctors only */}
      {isPatient && (
        <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 lg:left-64 z-30 bg-white/95 backdrop-blur-xl border-t border-border p-4 safe-area-bottom">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground">Consultation Fee</p>
              <p className="text-lg font-bold">Rs {Number(doctor.consultation_fee || 0).toLocaleString()}</p>
            </div>
            {isVerified ? (
              <button onClick={() => setShowBooking(true)} className="flex-1 max-w-[240px] py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-95 transition-all">
                Book Appointment
              </button>
            ) : (
              <span className="flex-1 max-w-[240px] py-3 rounded-xl bg-secondary text-muted-foreground text-sm text-center">
                Pending verification
              </span>
            )}
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBooking && (
        <BookingModal
          doctor={doctor}
          onClose={() => setShowBooking(false)}
          onConfirm={handleConfirmBooking}
          booking={booking}
        />
      )}
    </Layout>
  );
}