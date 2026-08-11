import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { recordAudit } from '@/lib/audit';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UploadCloud, FileText, Wand2, CheckCircle2, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toUserError } from '@/lib/userError';

const CATEGORIES = [
  'Blood Report', 'X-Ray', 'MRI', 'CT Scan', 'ECG', 'Ultrasound', 'Vaccination',
  'Medical Certificate', 'Operation Report', 'Discharge Summary', 'Insurance',
  'Prescription', 'Mental Health', 'Reproductive Health', 'Infectious Disease', 'Genetics',
];

const STEPS = ['Upload', 'Extract', 'Review', 'Done'];

export default function ImportRecord() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', category: 'Blood Report', date: new Date().toISOString().split('T')[0],
    date_precision: 'day', doctor_name: '', source_hospital: '', notes: '',
  });
  const [savedId, setSavedId] = useState(null);
  const [savedDraft, setSavedDraft] = useState(false);
  const fileRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
      setFileUrl(file_url);
      setForm(prev => ({ ...prev, title: prev.title || f.name.replace(/\.[^/.]+$/, '') }));
      setStep(1);
    } catch (err) {
      toast({ title: 'Upload failed', description: toUserError(err, 'Could not upload file'), variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: fileUrl,
        json_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: 'string' },
            date: { type: 'string' },
            date_precision: { type: 'string' },
            doctor_name: { type: 'string' },
            source_hospital: { type: 'string' },
            notes: { type: 'string' },
          },
        },
      });
      const out = res?.output || {};
      setForm(prev => ({
        ...prev,
        title: out.title || prev.title,
        category: CATEGORIES.includes(out.category) ? out.category : prev.category,
        date: out.date || prev.date,
        date_precision: ['day', 'month', 'year'].includes(out.date_precision) ? out.date_precision : prev.date_precision,
        doctor_name: out.doctor_name || prev.doctor_name,
        source_hospital: out.source_hospital || prev.source_hospital,
        notes: out.notes || prev.notes,
      }));
      setStep(2);
    } catch (err) {
      toast({ title: 'Extraction failed', description: 'You can still review and fill fields manually.', variant: 'destructive' });
      setStep(2);
    } finally { setExtracting(false); }
  };

  const save = async (asDraft) => {
    setSaving(true);
    try {
      const payload = {
        patient_id: user.id,
        patient_name: user.full_name || 'Patient',
        title: form.title || file?.name || 'Imported record',
        category: form.category,
        date: form.date,
        date_precision: form.date_precision,
        doctor_name: form.doctor_name,
        source_hospital: form.source_hospital,
        notes: form.notes,
        file_url: fileUrl,
        file_type: file?.type,
        provenance: 'imported',
        is_draft: asDraft,
      };
      const created = await base44.entities.MedicalRecord.create(payload);
      setSavedId(created.id);
      setSavedDraft(asDraft);
      await recordAudit({
        action: asDraft ? 'record_upload' : 'record_create',
        target_type: 'MedicalRecord',
        target_id: created.id,
        patient_id: user.id,
        detail: `Imported record "${payload.title}"${asDraft ? ' (draft)' : ''}`,
      });
      setStep(3);
    } catch (err) {
      toast({ title: 'Save failed', description: toUserError(err, 'Could not save record'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Layout title="Import a record">
      <div className="max-w-xl mx-auto animate-fade-in">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                i < step ? 'bg-primary border-primary text-primary-foreground' :
                i === step ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={cn('ml-2 text-xs font-medium hidden sm:block', i <= step ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
              {i < STEPS.length - 1 && <div className={cn('flex-1 h-px mx-2', i < step ? 'bg-primary' : 'bg-border')} />}
            </div>
          ))}
        </div>

        {/* Step 0: Upload */}
        {step === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center">
            <input ref={fileRef} type="file" onChange={e => handleFile(e.target.files[0])} className="hidden" accept="image/*,application/pdf" />
            <UploadCloud className="w-10 h-10 mx-auto text-primary/60 mb-3" />
            <p className="text-sm font-semibold">Upload a medical document</p>
            <p className="text-xs text-muted-foreground mt-1">PDF or image — lab report, prescription, scan, discharge summary…</p>
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="mt-4">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {uploading ? 'Uploading…' : 'Choose file'}
            </Button>
          </div>
        )}

        {/* Step 1: Extract */}
        {step === 1 && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-5 h-5 text-primary" />
              <p className="text-sm font-semibold truncate flex-1">{file?.name}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-4">We'll try to read the document and pre-fill the fields. You can edit everything next.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep(0); setFile(null); setFileUrl(null); }}><ArrowLeft className="w-4 h-4" /> Back</Button>
              <Button onClick={handleExtract} disabled={extracting} className="flex-1">
                {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {extracting ? 'Reading document…' : 'Extract fields'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-semibold mb-1">Review & confirm</p>
            <Field label="Title"><Input value={form.title} onChange={e => set('title', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select value={form.category} onChange={e => set('category', e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Date precision">
                <select value={form.date_precision} onChange={e => set('date_precision', e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="day">Exact day</option>
                  <option value="month">Month only</option>
                  <option value="year">Year only</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
              <Field label="Doctor (optional)"><Input value={form.doctor_name} onChange={e => set('doctor_name', e.target.value)} /></Field>
            </div>
            <Field label="Source hospital / lab (optional)"><Input value={form.source_hospital} onChange={e => set('source_hospital', e.target.value)} /></Field>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4" /> Back</Button>
              <Button variant="secondary" onClick={() => save(true)} disabled={saving} className="flex-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Save as draft</Button>
              <Button onClick={() => save(false)} disabled={saving} className="flex-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}Publish</Button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
            <p className="text-sm font-semibold">{savedDraft ? 'Saved as draft' : 'Record published'}</p>
            <p className="text-xs text-muted-foreground mt-1">You can review it on your timeline. Drafts stay hidden from your published history until you publish them.</p>
            <div className="flex gap-2 justify-center mt-5">
              <Button variant="outline" onClick={() => navigate('/records')}>Back to records</Button>
              <Button onClick={() => navigate('/timeline')}>View timeline</Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}