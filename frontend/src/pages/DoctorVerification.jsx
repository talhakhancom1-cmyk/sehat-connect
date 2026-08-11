import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import { useDoctorProfile } from '@/lib/useRole';
import { recordAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { ShieldCheck, Upload, FileCheck2, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toUserError } from '@/lib/userError';

export default function DoctorVerification() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { doctor, loading } = useDoctorProfile();

  const [licenseNumber, setLicenseNumber] = useState(doctor?.license_number || '');
  const [licenseDoc, setLicenseDoc] = useState(null);
  const [identityDoc, setIdentityDoc] = useState(null);
  const [notes, setNotes] = useState(doctor?.verification_notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(null); // 'license' | 'identity' | null

  const status = doctor?.verification_status || 'pending';

  const uploadFile = async (file) => {
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return file_url;
    } catch (e) {
      console.error(e);
      toast({ title: 'File upload failed', description: toUserError(e), variant: 'destructive' });
      throw e;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!doctor) return;
    if (!licenseNumber.trim()) {
      toast({ title: 'License number required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      let licenseUrl = doctor.license_document_url;
      let identityUrl = doctor.identity_document_url;
      if (licenseDoc) {
        setUploading('license');
        licenseUrl = await uploadFile(licenseDoc);
      }
      if (identityDoc) {
        setUploading('identity');
        identityUrl = await uploadFile(identityDoc);
      }
      setUploading(null);

      await base44.entities.Doctor.update(doctor.id, {
        license_number: licenseNumber.trim(),
        license_document_url: licenseUrl,
        identity_document_url: identityUrl,
        verification_notes: notes.trim(),
        verification_submitted_at: new Date().toISOString(),
        verification_status: 'pending',
      });

      await recordAudit({
        action: 'doctor_verify',
        target_type: 'Doctor',
        target_id: doctor.id,
        detail: 'Doctor submitted license + identity documents for review',
      });

      toast({
        title: 'Verification submitted',
        description: 'An admin will review your documents. You will be able to accept appointments once verified.',
      });
      navigate('/doctor');
    } catch (err) {
      toast({ title: 'Submission failed', description: toUserError(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <Layout role="doctor" title="Verification">
        <div className="space-y-4">
          <div className="h-28 rounded-2xl shimmer" />
          <div className="h-64 rounded-2xl shimmer" />
        </div>
      </Layout>
    );
  }

  if (!doctor) {
    return (
      <Layout role="doctor" title="Verification">
        <div className="bg-card rounded-2xl p-8 text-center shadow-card">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm text-muted-foreground">No doctor profile found. Complete onboarding first.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout role="doctor" title="Doctor Verification">
      <div className="space-y-5 animate-fade-in max-w-2xl">
        {/* Status banner */}
        <div className="bg-card rounded-2xl p-5 shadow-card flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-base">Verification Status</h2>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {status === 'verified' && 'You are verified. Patients can find and book you, and you can accept appointments.'}
              {status === 'pending' && 'Your documents are awaiting admin review. Appointment actions are limited until verified.'}
              {status === 'suspended' && 'Your verification has been suspended. Please contact support or resubmit your documents for review.'}
            </p>
          </div>
        </div>

        {status === 'verified' ? (
          <div className="bg-card rounded-2xl p-6 shadow-card text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-2" />
            <p className="font-semibold">Your credentials are verified</p>
            <p className="text-sm text-muted-foreground mt-1">No further action needed. You can update your documents below if they change.</p>
          </div>
        ) : null}

        {/* Submission form */}
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-5 shadow-card space-y-4">
          <h3 className="font-bold text-sm">Submit verification documents</h3>

          <div className="space-y-2">
            <Label htmlFor="license">Medical license number (PMDC / equivalent)</Label>
            <Input
              id="license"
              placeholder="e.g. PMDC-12345"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>License document (PDF / image)</Label>
            <FileInput
              current={doctor.license_document_url}
              file={licenseDoc}
              onChange={setLicenseDoc}
              uploading={uploading === 'license'}
            />
          </div>

          <div className="space-y-2">
            <Label>Government-issued ID</Label>
            <FileInput
              current={doctor.identity_document_url}
              file={identityDoc}
              onChange={setIdentityDoc}
              uploading={uploading === 'identity'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes for reviewer (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any context about your credentials or documents…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <Button type="submit" className="w-full h-12" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {uploading ? `Uploading ${uploading}…` : 'Submitting…'}
              </>
            ) : (
              'Submit for review'
            )}
          </Button>
        </form>
      </div>
    </Layout>
  );
}

function FileInput({ current, file, onChange, uploading }) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary text-sm font-medium cursor-pointer hover:bg-secondary/70 transition-colors">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        <span>{file ? 'Replace' : 'Choose file'}</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      </label>
      {file ? (
        <span className="flex items-center gap-1.5 text-sm text-green-600">
          <FileCheck2 className="w-4 h-4" /> {file.name}
        </span>
      ) : current ? (
        <a href={current} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
          View current document
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">No file selected</span>
      )}
    </div>
  );
}