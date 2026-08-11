import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import DoctorCard from '@/components/DoctorCard';
import BookingModal from '@/components/BookingModal';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { Search, SlidersHorizontal, MapPin, X } from 'lucide-react';

const specialties = ['Cardiology', 'Dermatology', 'General Medicine', 'Neurology', 'Orthopedics', 'Pediatrics', 'Psychiatry', 'Gynecology', 'ENT', 'Gastroenterology'];
const cities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar'];
const sortOptions = [
  { label: 'Highest Rated', value: '-rating' },
  { label: 'Lowest Fee', value: 'consultation_fee' },
  { label: 'Most Experienced', value: '-experience_years' },
];

export default function FindDoctors() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ specialty: '', city: '', mode: '', sort: '-rating' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    loadDoctors();
  }, []);

  const loadDoctors = async () => {
    try {
      const data = await base44.entities.Doctor.filter({ verification_status: 'verified' }, '-rating', 50);
      setDoctors(data);
      setFiltered(data);
    } catch {
      setDoctors([]);
      setFiltered([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let result = [...doctors];
    if (search) {
      result = result.filter(d =>
        d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        d.specialty?.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (filters.specialty) result = result.filter(d => d.specialty === filters.specialty);
    if (filters.city) result = result.filter(d => d.city === filters.city);
    if (filters.mode) result = result.filter(d => d.availability_modes?.includes(filters.mode));

    switch (filters.sort) {
      case '-rating': result.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case 'consultation_fee': result.sort((a, b) => (a.consultation_fee || 0) - (b.consultation_fee || 0)); break;
      case '-experience_years': result.sort((a, b) => (b.experience_years || 0) - (a.experience_years || 0)); break;
    }
    setFiltered(result);
  }, [doctors, search, filters]);

  const handleBook = (doctor) => setSelectedDoctor(doctor);

  const handleConfirmBooking = async (bookingDetails) => {
    if (booking) return;
    setBooking(true);
    try {
      await base44.entities.Appointment.create({
        doctor_id: selectedDoctor.id,
        doctor_name: selectedDoctor.full_name,
        patient_id: user?.id,
        doctor_user_id: selectedDoctor.user_id,
        patient_name: user?.display_name || user?.full_name || 'Patient',
        appointment_date: bookingDetails.appointment_date,
        time_slot: bookingDetails.time_slot,
        type: bookingDetails.type,
        status: 'pending',
        consultation_fee: selectedDoctor.consultation_fee,
        payment_status: 'unpaid',
        reason: 'General consultation',
      });
      toast({ title: 'Appointment booked!', description: `Your appointment with ${selectedDoctor.full_name} is pending confirmation.` });
      setSelectedDoctor(null);
    } catch (e) {
      toast({ title: 'Booking failed', description: 'Could not book the appointment. Please try again.', variant: 'destructive' });
      console.error(e);
    } finally {
      setBooking(false);
    }
  };

  return (
    <Layout title="Find Doctors" subtitle={`${filtered.length} doctors available`}>
      <div className="space-y-4 animate-fade-in">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card border border-border">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or specialty…"
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/60"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Filters</span>
          </button>
        </div>

        <div className="flex gap-4">
          {/* Filters Sidebar */}
          {showFilters && (
            <div className="w-56 shrink-0 space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Specialty</label>
                  <select
                    value={filters.specialty}
                    onChange={e => setFilters({ ...filters, specialty: e.target.value })}
                    className="w-full mt-1.5 bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-primary/30"
                  >
                    <option value="">All</option>
                    {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">City</label>
                  <select
                    value={filters.city}
                    onChange={e => setFilters({ ...filters, city: e.target.value })}
                    className="w-full mt-1.5 bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-primary/30"
                  >
                    <option value="">All Cities</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consultation Type</label>
                  <div className="space-y-1 mt-1.5">
                    {['video', 'physical', 'home'].map(mode => (
                      <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          checked={filters.mode === mode}
                          onChange={() => setFilters({ ...filters, mode: filters.mode === mode ? '' : mode })}
                          className="accent-primary"
                        />
                        <span className="capitalize">{mode}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort By</label>
                  <select
                    value={filters.sort}
                    onChange={e => setFilters({ ...filters, sort: e.target.value })}
                    className="w-full mt-1.5 bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-primary/30"
                  >
                    {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => setFilters({ specialty: '', city: '', mode: '', sort: '-rating' })}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear Filters
                </button>
              </div>
            </div>
          )}

          {/* Doctor Grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-lg bg-card border border-border animate-pulse" />)}
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map(doctor => (
                  <DoctorCard key={doctor.id} doctor={doctor} onBook={handleBook} />
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-2xl shadow-card">
                <EmptyState icon={MapPin} title="No doctors found" description="Try adjusting your search or filters" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {selectedDoctor && (
        <BookingModal
          doctor={selectedDoctor}
          onClose={() => setSelectedDoctor(null)}
          onConfirm={handleConfirmBooking}
          booking={booking}
        />
      )}
    </Layout>
  );
}