import React from 'react';
import { cn, authFileUrl } from '@/lib/utils';
import { getDoctorPhoto } from '@/lib/doctorPhotos';

const sizeMap = {
  sm: { box: 'w-8 h-8', radius: 'rounded-lg', text: 'text-[10px]' },
  md: { box: 'w-10 h-10', radius: 'rounded-xl', text: 'text-xs' },
  lg: { box: 'w-12 h-12', radius: 'rounded-xl', text: 'text-sm' },
  xl: { box: 'w-16 h-16', radius: 'rounded-2xl', text: 'text-base' },
};

export default function DoctorAvatar({ name, imageUrl, size = 'md', className, round = false, isOnline = false }) {
  const photo = imageUrl ? authFileUrl(imageUrl) : getDoctorPhoto(name);
  const cfg = sizeMap[size] || sizeMap.md;
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'Dr';

  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden bg-primary/10 flex items-center justify-center ring-2',
        isOnline ? 'ring-green-400' : 'ring-primary/20',
        cfg.box,
        round ? 'rounded-full' : cfg.radius,
        className
      )}
    >
      <img
        src={photo}
        alt={name || 'Doctor'}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
      <span
        className={cn('font-bold text-primary', cfg.text)}
        style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
      >
        {initials}
      </span>
    </div>
  );
}