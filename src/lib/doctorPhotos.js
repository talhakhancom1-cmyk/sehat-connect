// Consistent professional doctor headshots from Unsplash
// Same photographic style, lighting, and crop across all cards
const doctorPhotos = [
  'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1638202993928-7267aad84c31?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1598386867461-501a0325c55a?w=200&h=200&fit=crop&crop=faces',
];

export function getDoctorPhoto(name) {
  if (!name) return doctorPhotos[0];
  const hash = name.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return doctorPhotos[hash % doctorPhotos.length];
}