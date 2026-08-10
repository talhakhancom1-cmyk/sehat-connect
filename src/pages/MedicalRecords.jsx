import React, { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import HealthMetricCard from '@/components/HealthMetricCard';
import DoctorAvatar from '@/components/DoctorAvatar';
import EmptyState from '@/components/EmptyState';
import FamilyShareModal from '@/components/FamilyShareModal';
import FamilyAuthorizations from '@/components/FamilyAuthorizations';
import SharedRecordsList from '@/components/SharedRecordsList';
import { Heart, Activity, Droplets, Plus, ChevronRight, FileText, Search, FileImage, Scale, UploadCloud, CalendarClock, Share2, X, Loader2 } from 'lucide-react';
import { cn, authFileUrl } from '@/lib/utils';
import { formatRecordDate } from '@/lib/recordDate';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';

const categories = ['All', 'Blood Report', 'X-Ray', 'MRI', 'CT Scan', 'ECG', 'Ultrasound', 'Vaccination', 'Prescription', 'Operation Report', 'Discharge Summary'];

const categoryColors = {
  'Blood Report': 'text-rose-600 bg-rose-50',
  'X-Ray': 'text-blue-600 bg-blue-50',
  'MRI': 'text-indigo-600 bg-indigo-50',
  'CT Scan': 'text-amber-600 bg-amber-50',
  'ECG': 'text-red-600 bg-red-50',
  'Ultrasound': 'text-teal-600 bg-teal-50',
  'Vaccination': 'text-indigo-600 bg-indigo-50',
  'Prescription': 'text-indigo-600 bg-indigo-50',
  'Operation Report': 'text-orange-600 bg-orange-50',
  'Discharge Summary': 'text-teal-600 bg-teal-50',
};

export default function MedicalRecords() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [tab, setTab] = useState('mine');
  const [showShare, setShowShare] = useState(false);
  const [authKey, setAuthKey] = useState(0);
  const [pendingFile, setPendingFile] = useState(null);
  const [pickCategory, setPickCategory] = useState(categories[1]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const load = async () => {
    try {
      const data = await base44.entities.MedicalRecord.filter({ patient_id: user.id }, '-date', 100);
      setRecords(data);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };

  // Selecting a file just opens the category picker — it does NOT upload
  // immediately. Uploading before the category is chosen was the cause of
  // every quick-add record being saved as "Blood Report" regardless of what
  // was actually uploaded (e.g. an X-ray).
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setPickCategory(categories[1]);
    setPendingFile(file);
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.MedicalRecord.create({
        patient_name: user?.full_name || user?.display_name || 'Patient',
        title: file.name.replace(/\.[^/.]+$/, ''),
        category: pickCategory,
        date: new Date().toISOString().split('T')[0],
        file_url,
        file_type: file.type,
        notes: 'Uploaded by patient',
      });
      toast({ title: 'Record uploaded', description: `${file.name} has been added as ${pickCategory}.` });
      setPendingFile(null);
      load();
    } catch (err) {
      toast({ title: 'Upload failed', description: 'Could not upload the file. Please try again.', variant: 'destructive' });
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const filtered = records.filter(r => {
    if (category !== 'All' && r.category !== category) return false;
    if (search && !r.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Tab switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-card rounded-full border border-border w-fit">
          <button
            onClick={() => setTab('mine')}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-semibold transition-all',
              tab === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            My Records
          </button>
          <button
            onClick={() => setTab('shared')}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-semibold transition-all',
              tab === 'shared' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Shared with me
          </button>
        </div>

        {tab === 'shared' ? (
          <SharedRecordsList />
        ) : (
          <>
            {/* Health Metrics */}
            <div className="animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-bold text-base">Health Metric</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Last update {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate('/timeline')}
                    className="px-3 py-2 rounded-full bg-card border border-border text-sm font-medium flex items-center gap-1.5 hover:bg-secondary active:scale-95 transition-all"
                  >
                    <CalendarClock className="w-4 h-4" /> Timeline
                  </button>
                  <button
                    onClick={() => navigate('/records/import')}
                    className="px-3 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    <UploadCloud className="w-4 h-4" /> Import
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="px-3 py-2 rounded-full bg-foreground text-background text-sm font-medium flex items-center gap-1.5 hover:bg-foreground/90 active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <HealthMetricCard icon={Heart} label="Blood Pressure" value="—" unit="mmHg" color="bg-green-50 text-green-600" index={0} />
                <HealthMetricCard icon={Activity} label="Heart Rate" value="—" unit="bpm" color="bg-rose-50 text-rose-600" index={1} />
                <HealthMetricCard icon={Scale} label="BMI" value="—" unit="" color="bg-blue-50 text-blue-600" index={2} />
                <HealthMetricCard icon={Droplets} label="Blood Sugar" value="—" unit="mg/dL" color="bg-amber-50 text-amber-600" index={3} />
              </div>
            </div>

            {/* Medical History */}
            <div className="animate-slide-up" style={{ animationDelay: '60ms' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-base">Medical History</h2>
                <span className="text-sm text-primary font-medium">{records.length} visits</span>
              </div>
              {loading ? (
                <div className="bg-card rounded-2xl shadow-card divide-y divide-border/60">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <div className="w-10 h-10 rounded-full shimmer" />
                      <div className="flex-1 h-4 shimmer rounded" />
                    </div>
                  ))}
                </div>
              ) : records.length > 0 ? (
                <div className="bg-card rounded-2xl divide-y divide-border/60 shadow-card overflow-hidden">
                  {records.slice(0, 5).map((rec, i) => (
                    <div
                      key={rec.id}
                      className="flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors cursor-pointer animate-slide-up"
                      style={{ animationDelay: `${100 + i * 50}ms` }}
                    >
                      <DoctorAvatar name={rec.doctor_name || rec.patient_name} size="md" round />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{rec.doctor_name || rec.title}</p>
                        <p className="text-xs text-muted-foreground">{rec.category} · {formatRecordDate(rec)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-card rounded-2xl shadow-card">
                  <EmptyState
                    icon={FileImage}
                    title="No medical history yet"
                    description="Your doctor visits will appear here"
                  />
                </div>
              )}
            </div>

            {/* Documents */}
            <div className="animate-slide-up" style={{ animationDelay: '120ms' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-base">Documents</h2>
                <button
                  onClick={() => setShowShare(true)}
                  className="px-3 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-medium flex items-center gap-1.5 hover:bg-primary/20 active:scale-95 transition-all"
                >
                  <Share2 className="w-4 h-4" /> Share with family
                </button>
              </div>
              <input ref={fileRef} type="file" onChange={handleFileSelect} className="hidden" />

              {/* Search */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search records…"
                    className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/60"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1 mb-3">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all active:scale-95',
                      category === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground border border-border hover:bg-secondary'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Records Grid */}
              {filtered.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filtered.map((rec, i) => {
                    const catColor = categoryColors[rec.category] || 'text-muted-foreground bg-secondary';
                    return (
                      <div
                        key={rec.id}
                        className="rounded-2xl border border-border bg-card p-4 hover:shadow-soft hover:-translate-y-0.5 transition-all duration-200 animate-slide-up shadow-card"
                        style={{ animationDelay: `${140 + i * 50}ms` }}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', catColor)}>
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{rec.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{formatRecordDate(rec)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', catColor)}>
                            {rec.category}
                          </span>
                          {rec.file_url && (
                            <a href={authFileUrl(rec.file_url)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary font-medium hover:underline">
                              View
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-card rounded-2xl shadow-card">
                  <EmptyState
                    icon={FileImage}
                    title="No documents found"
                    description="Upload your first medical record to get started"
                    actionLabel="Upload Record"
                    onAction={() => fileRef.current?.click()}
                  />
                </div>
              )}
            </div>

            {/* Active family authorizations */}
            <FamilyAuthorizations key={authKey} scope="record_view" />
          </>
        )}
      </div>

      {showShare && (
        <FamilyShareModal
          scope="record_view"
          onClose={() => setShowShare(false)}
          onGranted={() => { setShowShare(false); setAuthKey((k) => k + 1); }}
        />
      )}

      {pendingFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !uploading && setPendingFile(null)}>
          <div className="bg-card rounded-2xl w-full max-w-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between border-b border-border">
              <h3 className="font-bold text-base">Choose a category</h3>
              <button onClick={() => !uploading && setPendingFile(null)} className="p-2 rounded-full hover:bg-secondary active:scale-95 transition-all">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary/50">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm truncate">{pendingFile.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {categories.filter((c) => c !== 'All').map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPickCategory(cat)}
                    className={cn(
                      'px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left',
                      pickCategory === cat
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <button
                onClick={confirmUpload}
                disabled={uploading}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                {uploading ? 'Uploading…' : `Upload as ${pickCategory}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}