// Unified canonical health-record category taxonomy (EHC Bible §8).
// Single source of truth — used by MedicalRecord.category, Consent.categories,
// HealthCard.categories, and any future sharing/import scope.
//
// IMPORTANT: The `key` values MUST match the backend RECORD_CATEGORIES enum
// in backend/constants/ehc.js exactly. The `label` is what the user sees.

export const HEALTH_CATEGORIES = [
  { key: 'allergies_intolerances', label: 'Allergies & Intolerances' },
  { key: 'current_medications', label: 'Current Medications' },
  { key: 'previous_medications', label: 'Previous Medications' },
  { key: 'diagnoses', label: 'Diagnoses' },
  { key: 'laboratory_results', label: 'Laboratory Results' },
  { key: 'imaging', label: 'Imaging (X-Ray, MRI, CT, Ultrasound)' },
  { key: 'vaccinations', label: 'Vaccinations' },
  { key: 'procedures_surgeries', label: 'Procedures & Surgeries' },
  { key: 'mental_health', label: 'Mental Health Records' },
  { key: 'reproductive_health', label: 'Reproductive Health Records' },
  { key: 'infectious_disease', label: 'Infectious Disease Records' },
  { key: 'genetic_information', label: 'Genetic Information' },
  { key: 'wearable_data', label: 'Wearable Data' },
  { key: 'medication_adherence', label: 'Medication Adherence' },
  { key: 'uploaded_documents', label: 'Uploaded Documents' },
  { key: 'chat_clinical_notes', label: 'Chat Clinical Notes' },
];

// Convenience arrays for dropdowns and filters
export const HEALTH_CATEGORY_KEYS = HEALTH_CATEGORIES.map(c => c.key);
export const HEALTH_CATEGORY_LABELS = HEALTH_CATEGORIES.map(c => c.label);

// Map a key to its human-readable label
export const categoryLabel = (key) =>
  HEALTH_CATEGORIES.find(c => c.key === key)?.label || key;

// Map a label back to its key (for backward compat with old data)
export const categoryKey = (label) =>
  HEALTH_CATEGORIES.find(c => c.label === label)?.key || label;

// Categories excluded from new consent grants / household delegation / health cards
// unless the patient explicitly opts them in for that specific grant (§8.3).
export const SENSITIVE_CATEGORY_KEYS = new Set([
  'mental_health',
  'reproductive_health',
  'infectious_disease',
  'genetic_information',
]);

export const isSensitiveCategory = (category) =>
  SENSITIVE_CATEGORY_KEYS.has(category);

// Filter a list of categories down to the non-sensitive ones (default-excluded set).
export const defaultShareableCategories = (categories = []) =>
  (categories || []).filter((c) => !SENSITIVE_CATEGORY_KEYS.has(c));

export const PROVENANCE_VALUES = [
  'patient-entered',
  'doctor-entered',
  'imported',
  'device',
];

export const DATE_PRECISION_VALUES = ['day', 'month', 'year'];
