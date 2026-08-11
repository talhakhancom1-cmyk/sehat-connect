import React from 'react';
import { Building2, Navigation, Phone, MapPin, LocateFixed, Loader2, ExternalLink, Crosshair } from 'lucide-react';

const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export default function NearbyHospitals({ hospitals, loading, error, address, onEnable, enabled }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          Nearest Hospitals
        </h3>
        <button onClick={onEnable} disabled={loading} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary/10 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : enabled ? <Crosshair className="w-3.5 h-3.5" /> : <LocateFixed className="w-3.5 h-3.5" />}
          {enabled ? 'Refresh' : 'Use live location'}
        </button>
      </div>

      {enabled && address && (
        <div className="mb-3 flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
          <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">{address}</p>
        </div>
      )}

      <div className="space-y-2">
        {!enabled && !loading && (
          <div className="py-8 text-center">
            <LocateFixed className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Enable live location to find the closest hospitals near you.</p>
          </div>
        )}
        {loading && [1, 2, 3].map(i => <div key={i} className="h-14 rounded-md bg-secondary/30 shimmer" />)}
        {error && <p className="text-xs text-destructive py-4 text-center">{error}</p>}
        {!loading && enabled && hospitals.length === 0 && !error && (
          <p className="text-xs text-muted-foreground py-4 text-center">No hospitals found within 10 km.</p>
        )}
        {!loading && hospitals.map(hosp => (
          <div key={hosp.id} className="flex items-center gap-3 p-3 rounded-md bg-secondary/20 hover:bg-secondary/40 transition-colors">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Navigation className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{hosp.name}</p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{fmtDist(hosp.distance)}</span>
                <span>·</span>
                <span>{hosp.eta}</span>
              </div>
            </div>
            {hosp.emergency && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-destructive/10 text-destructive border border-destructive/20">24/7 ER</span>
            )}
            <div className="flex items-center gap-1">
              {hosp.phone && <a href={`tel:${hosp.phone}`} className="p-2 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"><Phone className="w-3.5 h-3.5" /></a>}
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${hosp.lat},${hosp.lon}`} target="_blank" rel="noreferrer" className="p-2 rounded-md bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}