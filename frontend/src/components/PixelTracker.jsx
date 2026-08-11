import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { initMetaPixel, initTiktokPixel, trackPageView } from '@/lib/pixels';

export default function PixelTracker() {
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    base44.entities.TrackingConfig.list()
      .then((configs) => {
        if (!mounted) return;
        const cfg = configs[0];
        if (!cfg) return;
        if (cfg.meta_enabled && cfg.meta_pixel_id) initMetaPixel(cfg.meta_pixel_id);
        if (cfg.tiktok_enabled && cfg.tiktok_pixel_id) initTiktokPixel(cfg.tiktok_pixel_id);
        setReady(true);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    trackPageView();
  }, [location.pathname, ready]);

  return null;
}