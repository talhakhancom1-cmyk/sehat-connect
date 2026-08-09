import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import { Siren, Heart, Ambulance, Share2, Phone, MessageSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import EmergencyContacts from '@/components/emergency/EmergencyContacts';
import NearbyHospitals from '@/components/emergency/NearbyHospitals';

const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371; const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const etaFor = (km) => {
  const mins = Math.max(2, Math.round((km / 35) * 60));
  return `${mins} min`;
};

export default function Emergency() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [sosActive, setSosActive] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(true);

  const [hospitals, setHospitals] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const [address, setAddress] = useState('');
  const [enabled, setEnabled] = useState(false);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const list = await base44.entities.EmergencyContact.list('-created_date', 50);
      setContacts(list || []);
    } catch { setContacts([]); }
    setContactsLoading(false);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const addContact = async (form) => {
    try {
      const created = await base44.entities.EmergencyContact.create({
        name: form.name.trim(),
        relation: form.relation,
        phone: form.phone.trim()
      });
      setContacts(prev => [created, ...prev]);
      toast({ title: 'Contact saved' });
    } catch {
      toast({ title: 'Could not save contact', variant: 'destructive' });
    }
  };

  const deleteContact = async (contact) => {
    try {
      await base44.entities.EmergencyContact.delete(contact.id);
      setContacts(prev => prev.filter(c => c.id !== contact.id));
      toast({ title: 'Contact removed' });
    } catch {
      toast({ title: 'Could not remove contact', variant: 'destructive' });
    }
  };

  const fetchHospitals = useCallback(async (lat, lon) => {
    const query = `[out:json][timeout:25];(node["amenity"="hospital"](around:10000,${lat},${lon});way["amenity"="hospital"](around:10000,${lat},${lon});relation["amenity"="hospital"](around:10000,${lat},${lon}););out center 200;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    const json = await res.json();
    const items = (json.elements || []).map(el => {
      const t = el.tags || {};
      const eLat = el.lat ?? el.center?.lat;
      const eLon = el.lon ?? el.center?.lon;
      return {
        id: String(el.id),
        name: t.name || t['name:en'] || 'Unnamed Hospital',
        lat: eLat, lon: eLon,
        phone: t.phone || t['contact:phone'] || '',
        emergency: /emergency|24| casualty|er/i.test((t.name || '') + ' ' + (t.operator || '')) || !!t.emergency,
        distance: haversine(lat, lon, eLat, eLon)
      };
    }).filter(h => h.name && h.lat != null);
    items.sort((a, b) => a.distance - b.distance);
    return items.slice(0, 8);
  }, []);

  const reverseGeocode = async (lat, lon) => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
      const j = await r.json();
      setAddress(j.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    } catch { setAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`); }
  };

  const enableLocation = useCallback(async () => {
    setLocError('');
    if (!navigator.geolocation) { setLocError('Geolocation not supported on this device.'); return; }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setEnabled(true);
      reverseGeocode(lat, lon);
      try {
        const list = await fetchHospitals(lat, lon);
        setHospitals(list.map(h => ({ ...h, eta: etaFor(h.distance) })));
      } catch {
        setLocError('Could not fetch nearby hospitals. Try again.');
      }
      setLocLoading(false);
    }, (err) => {
      const msg = err.code === 1 ? 'Location permission denied. Enable it in your browser settings.' : 'Could not get your location. Try again.';
      setLocError(msg);
      setLocLoading(false);
    }, { enableHighAccuracy: true, timeout: 15000 });
  }, [fetchHospitals]);

  const triggerSOS = () => {
    if (!enabled) enableLocation();
    setSosActive(true);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) { clearInterval(interval); setSosActive(false); setCountdown(3); }
    }, 1000);
  };

  // Calculate age from date_of_birth if available
  const calculateAge = (dob) => {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const age = calculateAge(user?.date_of_birth);

  const medicalProfile = [
    { label: 'Blood Group', value: user?.blood_type || 'Not set' },
    { label: 'Age', value: age != null ? `${age} years` : 'Not set' },
    { label: 'Allergies', value: user?.allergies || 'None recorded' },
    { label: 'Chronic Diseases', value: 'None recorded' },
  ];

  return (
    <Layout title="Emergency" subtitle="Press SOS to alert emergency services">
      <div className="space-y-6 animate-fade-in">
        {/* SOS Button */}
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-8 flex flex-col items-center">
          <button
            onClick={triggerSOS}
            disabled={sosActive}
            className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
              sosActive ? 'bg-destructive animate-pulse-glow scale-110' : 'bg-destructive/10 border-2 border-destructive/30 hover:bg-destructive/20 hover:scale-105'
            }`}
          >
            <Siren className={`w-12 h-12 ${sosActive ? 'text-destructive-foreground' : 'text-destructive'}`} />
            {sosActive && <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping" />}
          </button>
          <p className="mt-4 text-lg font-semibold">{sosActive ? `Alerting in ${countdown}…` : 'Press SOS'}</p>
          <p className="text-xs text-muted-foreground mt-1">{sosActive ? 'Sharing location & medical profile' : 'Alerts emergency services, family & ambulance'}</p>
        </div>

        {/* Medical Profile Card */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Heart className="w-4 h-4 text-primary" /> Emergency Medical Profile
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {medicalProfile.map(item => (
              <div key={item.label} className="p-3 rounded-md bg-secondary/30 text-center">
                <p className="text-sm font-mono font-semibold text-primary">{item.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Two Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <NearbyHospitals hospitals={hospitals} loading={locLoading} error={locError} address={address} onEnable={enableLocation} enabled={enabled} />
          <EmergencyContacts contacts={contacts} onAdd={addContact} onDelete={deleteContact} loading={contactsLoading} />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Call Ambulance', icon: Ambulance, color: 'destructive', href: 'tel:1122' },
            { label: 'Share Location', icon: Share2, color: 'primary', onClick: enableLocation },
            { label: 'Notify Family', icon: Phone, color: 'primary', href: contacts[0] ? `tel:${contacts[0].phone}` : undefined },
            { label: 'Emergency Chat', icon: MessageSquare, color: 'primary', href: '/chat' },
          ].map(action => {
            const Icon = action.icon;
            const Comp = action.onClick ? 'button' : 'a';
            return (
              <Comp
                key={action.label}
                onClick={action.onClick}
                href={action.href}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${action.color === 'destructive' ? 'border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive' : 'border-border bg-card hover:border-primary/30 text-primary'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{action.label}</span>
              </Comp>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}