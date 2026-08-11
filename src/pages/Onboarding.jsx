import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Activity, User, Stethoscope, Loader2, Upload, ShieldCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { toUserError } from '@/lib/userError';
import { validatePhone, validateDateOfBirth, validateNumericRange } from '@/lib/validate';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'ehc_token';

const specialties = [
  'Cardiology', 'Dermatology', 'General Medicine', 'Neurology', 'Orthopedics',
  'Pediatrics', 'Psychiatry', 'Gynecology', 'ENT', 'Ophthalmology',
  'Gastroenterology', 'Urology', 'Oncology', 'Endocrinology', 'Pulmonology',
  'Nephrology', 'Rheumatology', 'Dentistry',
];
const cities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot', 'Gujranwala', 'Sukkur'];
const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const countries = ['Pakistan', 'United Arab Emirates', 'Saudi Arabia', 'United Kingdom', 'United States', 'Canada', 'Other'];

export default function Onboarding() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'doctor' ? 'doctor' : 'patient';
  const [role, setRole] = useState(initialRole);
  const [loading, setLoading] = useState(false);

  // Common fields
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Pakistan');
  const [profilePicUrl, setProfilePicUrl] = useState('');

  // Patient fields
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Doctor fields
  const [specialty, setSpecialty] = useState('');
  const [pmdcNumber, setPmdcNumber] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [bio, setBio] = useState('');
  const [licenseDocUrl, setLicenseDocUrl] = useState('');
  const [identityDocUrl, setIdentityDocUrl] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState('');

  const handleDocUpload = async (e, purpose, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(purpose);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', purpose);
      const token = localStorage.getItem(TOKEN_KEY);
      const resp = await fetch(`${API_BASE_URL}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
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
      setter(fullUrl);
      toast({ title: 'Document uploaded', description: file.name });
    } catch (err) {
      toast({ title: 'Upload failed', description: toUserError(err), variant: 'destructive' });
    } finally {
      setUploadingDoc('');
      e.target.value = '';
    }
  };

  const handleProfilePicUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show local preview immediately while uploading
    const localPreview = URL.createObjectURL(file);
    setProfilePicUrl(localPreview);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', 'profile_pic');
      const token = localStorage.getItem(TOKEN_KEY);
      const resp = await fetch(`${API_BASE_URL}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed (${resp.status})`);
      }
      const data = await resp.json();
      // Build a full URL with download token + cache-buster so the browser always shows the new image
      const baseUrl = API_BASE_URL.replace('/api', '');
      const displayUrl = data.download_token
        ? `${baseUrl}${data.file_url}?token=${data.download_token}&t=${Date.now()}`
        : data.file_url?.startsWith('http')
          ? `${data.file_url}&t=${Date.now()}`
          : `${baseUrl}${data.file_url}?t=${Date.now()}`;
      // Revoke the local blob URL to free memory
      URL.revokeObjectURL(localPreview);
      setProfilePicUrl(displayUrl);
      toast({ title: 'Photo uploaded' });
    } catch (err) {
      URL.revokeObjectURL(localPreview);
      toast({ title: 'Upload failed', description: toUserError(err), variant: 'destructive' });
    } finally {
      // Reset the file input so the same file can be re-selected
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Frontend validation — mirror backend rules. Show errors via toast.
    const phoneErr = validatePhone(phone);
    if (phoneErr) { toast({ title: 'Validation error', description: phoneErr, variant: 'destructive' }); return; }
    if (role === 'patient') {
      const dobErr = validateDateOfBirth(dateOfBirth);
      if (dobErr) { toast({ title: 'Validation error', description: dobErr, variant: 'destructive' }); return; }
      const ageErr = validateNumericRange(age, 0, 150, 'Age');
      if (ageErr) { toast({ title: 'Validation error', description: ageErr, variant: 'destructive' }); return; }
    } else {
      const feeErr = validateNumericRange(consultationFee, 0, 1000000, 'Consultation fee');
      if (feeErr) { toast({ title: 'Validation error', description: feeErr, variant: 'destructive' }); return; }
      const expErr = validateNumericRange(experienceYears, 0, 70, 'Experience years');
      if (expErr) { toast({ title: 'Validation error', description: expErr, variant: 'destructive' }); return; }
    }
    setLoading(true);
    try {
      const payload = {
        role,
        display_name: displayName,
        phone,
        address,
        city,
        country,
        profile_pic_url: profilePicUrl
      };

      if (role === 'patient') {
        if (age) payload.age = parseInt(age);
        if (gender) payload.gender = gender;
        if (bloodType) payload.blood_type = bloodType;
        if (allergies) payload.allergies = allergies;
        if (dateOfBirth) payload.date_of_birth = dateOfBirth;
        if (emergencyContactName) payload.emergency_contact_name = emergencyContactName;
        if (emergencyContactPhone) payload.emergency_contact_phone = emergencyContactPhone;
      } else {
        if (specialty) payload.specialty = specialty;
        if (pmdcNumber) payload.pmdc_number = pmdcNumber;
        if (consultationFee) payload.consultation_fee = parseFloat(consultationFee);
        if (experienceYears) payload.experience_years = parseInt(experienceYears);
        if (bio) payload.bio = bio;
        if (licenseDocUrl) payload.license_document_url = licenseDocUrl;
        if (identityDocUrl) payload.identity_document_url = identityDocUrl;
      }

      const apiBase = API_BASE_URL;
      const token = localStorage.getItem(TOKEN_KEY);
      const resp = await fetch(`${apiBase}/v1/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (resp.status === 401) {
        throw new Error('Your session has expired. Please log in again.');
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Onboarding failed');
      }

      const result = await resp.json();
      toast({
        title: 'Profile saved!',
        description: role === 'doctor'
          ? 'Your profile is pending PMDC verification.'
          : 'Welcome to Sehat Connect!'
      });
      window.location.href = role === 'doctor' ? '/doctor' : '/';
    } catch (err) {
      toast({ title: 'Error', description: toUserError(err, 'Failed to save profile'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={Activity}
      title="Complete your profile"
      subtitle="Tell us about yourself to get started"
    >
      {/* Role Selector */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <button
          type="button"
          onClick={() => setRole('patient')}
          className={cn(
            'flex items-center justify-center gap-2 h-12 rounded-lg border text-sm font-medium transition-all',
            role === 'patient' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
          )}
        >
          <User className="w-4 h-4" />
          Patient
        </button>
        <button
          type="button"
          onClick={() => setRole('doctor')}
          className={cn(
            'flex items-center justify-center gap-2 h-12 rounded-lg border text-sm font-medium transition-all',
            role === 'doctor' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
          )}
        >
          <Stethoscope className="w-4 h-4" />
          Doctor
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Profile Picture Upload */}
        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="w-24 h-24 rounded-full bg-muted border-2 border-border overflow-hidden flex items-center justify-center">
            {profilePicUrl ? (
              <img src={profilePicUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-muted-foreground" />
            )}
          </div>
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              <Upload className="w-4 h-4" />
              Upload profile picture
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handleProfilePicUpload} />
          </label>
        </div>

        {/* Common Fields */}
        <div className="space-y-2">
          <Label htmlFor="name">Full Name *</Label>
          <Input id="name" placeholder="Your full name" value={displayName}
            onChange={e => setDisplayName(e.target.value)} className="h-11" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" placeholder="+92 300 1234567" value={phone}
              onChange={e => setPhone(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select city" /></SelectTrigger>
              <SelectContent>
                {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" placeholder="House #, Street, Area" value={address}
            onChange={e => setAddress(e.target.value)} className="h-11" />
        </div>

        <div className="space-y-2">
          <Label>Country</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent>
              {countries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Patient-specific fields */}
        {role === 'patient' && (
          <>
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Medical Information</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input id="dob" type="date" value={dateOfBirth}
                  onChange={e => setDateOfBirth(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" placeholder="30" value={age}
                  onChange={e => setAge(e.target.value)} className="h-11" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Blood Type</Label>
                <Select value={bloodType} onValueChange={setBloodType}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {bloodTypes.map(bt => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="allergies">Allergies</Label>
              <Input id="allergies" placeholder="e.g. Penicillin, Peanuts, or None" value={allergies}
                onChange={e => setAllergies(e.target.value)} className="h-11" />
            </div>
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Emergency Contact</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="emgName">Contact Name</Label>
                <Input id="emgName" placeholder="Family member name" value={emergencyContactName}
                  onChange={e => setEmergencyContactName(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emgPhone">Contact Phone</Label>
                <Input id="emgPhone" type="tel" placeholder="+92 300 1234567" value={emergencyContactPhone}
                  onChange={e => setEmergencyContactPhone(e.target.value)} className="h-11" />
              </div>
            </div>
          </>
        )}

        {/* Doctor-specific fields */}
        {role === 'doctor' && (
          <>
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Professional Information</h3>
            </div>
            <div className="space-y-2">
              <Label>Specialty *</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select specialty" /></SelectTrigger>
                <SelectContent>
                  {specialties.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pmdc">PMDC Registration Number *</Label>
              <Input id="pmdc" placeholder="e.g. PMC-12345" value={pmdcNumber}
                onChange={e => setPmdcNumber(e.target.value)} className="h-11" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fee">Consultation Fee (Rs)</Label>
                <Input id="fee" type="number" placeholder="2000" value={consultationFee}
                  onChange={e => setConsultationFee(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp">Experience (years)</Label>
                <Input id="exp" type="number" placeholder="5" value={experienceYears}
                  onChange={e => setExperienceYears(e.target.value)} className="h-11" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" placeholder="Brief professional bio, qualifications, areas of expertise..."
                value={bio} onChange={e => setBio(e.target.value)} rows={3} className="resize-none" />
            </div>

            {/* License / Identity Document Upload */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Verification Documents</h3>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>PMDC License Document (PDF/Image) *</Label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer flex-1">
                    <span className={cn(
                      'inline-flex items-center justify-center gap-2 h-11 w-full rounded-lg border-2 border-dashed border-border text-sm font-medium transition-all hover:border-primary hover:bg-primary/5',
                      licenseDocUrl && 'border-green-400 bg-green-50 text-green-700'
                    )}>
                      <Upload className="w-4 h-4" />
                      {uploadingDoc === 'license_doc' ? 'Uploading...' : licenseDocUrl ? 'Uploaded ✓ Click to replace' : 'Upload license document'}
                    </span>
                    <input type="file" accept=".pdf,image/*" className="hidden"
                      onChange={e => handleDocUpload(e, 'license_doc', setLicenseDocUrl)} />
                  </label>
                  {licenseDocUrl && (
                    <a href={licenseDocUrl} target="_blank" rel="noreferrer"
                      className="text-xs text-primary hover:underline whitespace-nowrap">View</a>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Identity Document (CNIC/Passport)</Label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer flex-1">
                    <span className={cn(
                      'inline-flex items-center justify-center gap-2 h-11 w-full rounded-lg border-2 border-dashed border-border text-sm font-medium transition-all hover:border-primary hover:bg-primary/5',
                      identityDocUrl && 'border-green-400 bg-green-50 text-green-700'
                    )}>
                      <Upload className="w-4 h-4" />
                      {uploadingDoc === 'identity_doc' ? 'Uploading...' : identityDocUrl ? 'Uploaded ✓ Click to replace' : 'Upload identity document'}
                    </span>
                    <input type="file" accept=".pdf,image/*" className="hidden"
                      onChange={e => handleDocUpload(e, 'identity_doc', setIdentityDocUrl)} />
                  </label>
                  {identityDocUrl && (
                    <a href={identityDocUrl} target="_blank" rel="noreferrer"
                      className="text-xs text-primary hover:underline whitespace-nowrap">View</a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">
                Your profile will be reviewed and PMDC verified before going live.
                You'll receive a notification once approved.
              </p>
            </div>
          </>
        )}

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Complete Profile'
          )}
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground mt-6">
        Powered by <span className="font-semibold text-foreground">Sehat Connect</span>
      </p>
    </AuthLayout>
  );
}
