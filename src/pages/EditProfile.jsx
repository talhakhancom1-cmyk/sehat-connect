import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Camera, Loader2, User as UserIcon } from 'lucide-react';
import { cn, authFileUrl } from '@/lib/utils';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'ehc_token';

export default function EditProfile() {
  const { user, checkUserAuth } = useAuth();
  const { role } = useRole();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doctor, setDoctor] = useState(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name || user.full_name || '');
    setPhone(user.phone || '');
    setProfilePicUrl(user.profile_pic_url || '');
  }, [user]);

  useEffect(() => {
    if (role !== 'doctor' || !user?.email) return;
    let active = true;
    (async () => {
      try {
        const docs = await base44.entities.Doctor.filter({ email: user.email });
        if (active) setDoctor(docs[0] || null);
      } catch {
        if (active) setDoctor(null);
      }
    })();
    return () => { active = false; };
  }, [role, user?.email]);

  const handlePicUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', 'profile_pic');
      const token = localStorage.getItem(TOKEN_KEY);
      const resp = await fetch(`${API_BASE_URL}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed (${resp.status})`);
      }
      const data = await resp.json();
      const baseUrl = API_BASE_URL.replace('/api', '');
      const fullUrl = data.download_token
        ? `${baseUrl}${data.file_url}?token=${data.download_token}`
        : `${baseUrl}${data.file_url}`;
      setProfilePicUrl(fullUrl);
      toast({ title: 'Photo uploaded' });
    } catch (err) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await base44.auth.updateMe({
        display_name: displayName,
        phone,
        profile_pic_url: profilePicUrl,
      });
      // Doctors have a separate Doctor row with its own profile_pic_url — keep it in sync.
      if (role === 'doctor' && doctor) {
        await base44.entities.Doctor.update(doctor.id, {
          full_name: displayName,
          phone,
          profile_pic_url: profilePicUrl,
          image_url: profilePicUrl,
        });
      }
      await checkUserAuth();
      toast({ title: 'Profile updated' });
    } catch (err) {
      toast({ title: 'Update failed', description: err.message || 'Please try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout role={role} title="My Profile">
      <div className="max-w-lg mx-auto animate-fade-in">
        <form onSubmit={handleSave} className="bg-card rounded-2xl p-6 shadow-card space-y-5">
          {/* Profile picture */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-muted border-2 border-border overflow-hidden flex items-center justify-center">
                {profilePicUrl ? (
                  <img src={authFileUrl(profilePicUrl)} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-10 h-10 text-muted-foreground" />
                )}
              </div>
              <label
                htmlFor="profile-pic-input"
                className={cn(
                  'absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-lg hover:bg-primary/90 transition-colors',
                  uploading && 'opacity-60 pointer-events-none'
                )}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </label>
              <input id="profile-pic-input" type="file" accept="image/*" className="hidden" onChange={handlePicUpload} />
            </div>
            <p className="text-xs text-muted-foreground">Tap the camera icon to change your photo</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Full name</Label>
            <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-11" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user?.email || ''} disabled className="h-11 bg-secondary/50" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" placeholder="+92 300 1234567" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 h-11" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
