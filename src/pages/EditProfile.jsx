import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Camera, Loader2, User as UserIcon, KeyRound, ShieldAlert } from 'lucide-react';
import { cn, authFileUrl } from '@/lib/utils';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'ehc_token';
const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function EditProfile() {
  const { user, checkUserAuth } = useAuth();
  const { role } = useRole();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Profile fields
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doctor, setDoctor] = useState(null);

  // Patient medical / emergency fields
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [savingMedical, setSavingMedical] = useState(false);

  // Password change fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name || user.full_name || '');
    setPhone(user.phone || '');
    setAddress(user.address || '');
    setCity(user.city || '');
    setProfilePicUrl(user.profile_pic_url || '');
    setBloodType(user.blood_type || '');
    setAllergies(user.allergies || '');
    setEmergencyContactName(user.emergency_contact_name || '');
    setEmergencyContactPhone(user.emergency_contact_phone || '');
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
        address,
        city,
        profile_pic_url: profilePicUrl,
      });
      // Doctors have a separate Doctor row with its own profile_pic_url — keep it in sync.
      if (role === 'doctor' && doctor) {
        await base44.entities.Doctor.update(doctor.id, {
          full_name: displayName,
          phone,
          address,
          city,
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

  const handleSaveMedical = async (e) => {
    e.preventDefault();
    setSavingMedical(true);
    try {
      await base44.auth.updateMe({
        blood_type: bloodType || null,
        allergies,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
      });
      await checkUserAuth();
      toast({ title: 'Medical info updated' });
    } catch (err) {
      toast({ title: 'Update failed', description: err.message || 'Please try again', variant: 'destructive' });
    } finally {
      setSavingMedical(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast({ title: 'Missing fields', description: 'Enter your current and new password.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Password too short', description: 'New password must be at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      await base44.auth.changePassword({ currentPassword, newPassword });
      toast({ title: 'Password changed' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast({ title: 'Password change failed', description: err.message || 'Please try again', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Layout role={role} title="My Profile">
      <div className="max-w-lg mx-auto animate-fade-in space-y-5">
        {/* Profile info */}
        <form onSubmit={handleSave} className="bg-card rounded-2xl p-6 shadow-card space-y-5">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-11" />
            </div>
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

        {/* Medical / emergency info — relevant for patients */}
        {role !== 'admin' && (
          <form onSubmit={handleSaveMedical} className="bg-card rounded-2xl p-6 shadow-card space-y-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">Emergency & medical info</h3>
            </div>

            <div className="space-y-2">
              <Label htmlFor="blood-type">Blood type</Label>
              <Select value={bloodType || undefined} onValueChange={setBloodType}>
                <SelectTrigger id="blood-type" className="h-11">
                  <SelectValue placeholder="Select blood type" />
                </SelectTrigger>
                <SelectContent>
                  {bloodTypes.map((bt) => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="allergies">Allergies</Label>
              <Input id="allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} className="h-11" placeholder="e.g. Penicillin, Peanuts" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ec-name">Emergency contact name</Label>
                <Input id="ec-name" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ec-phone">Emergency contact phone</Label>
                <Input id="ec-phone" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} className="h-11" />
              </div>
            </div>

            <Button type="submit" className="w-full h-11" disabled={savingMedical}>
              {savingMedical ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save medical info'}
            </Button>
          </form>
        )}

        {/* Change password */}
        <form onSubmit={handleChangePassword} className="bg-card rounded-2xl p-6 shadow-card space-y-5">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">Change password</h3>
          </div>

          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-11" autoComplete="current-password" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-11" autoComplete="new-password" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-11" autoComplete="new-password" />
          </div>

          <Button type="submit" className="w-full h-11" disabled={changingPassword}>
            {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update password'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
