import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function HealthCardTokenQR({ value, size = 200 }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => { if (active) setSrc(url); })
      .catch(() => { if (active) setSrc(null); });
    return () => { active = false; };
  }, [value, size]);

  if (!src) {
    return <div className="rounded-xl bg-secondary animate-pulse" style={{ width: size, height: size }} />;
  }
  return <img src={src} alt="Health card access QR" width={size} height={size} className="rounded-xl" />;
}