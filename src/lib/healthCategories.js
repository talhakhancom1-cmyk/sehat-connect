// Unified canonical health-record category taxonomy (EHC Bible §8).
// Single source of truth — used by MedicalRecord.category, Consent.categories,
// HealthCard.categories, and any future sharing/import scope.

export const HEALTH_CATEGORIES = [
  "Blood Report",
  "X-Ray",
  "MRI",
  "CT Scan",
  "ECG",
  "Ultrasound",
  "Vaccination",
  "Medical Certificate",
  "Operation Report",
  "Discharge Summary",
  "Insurance",
  "Prescription",
  "Mental Health",
  "Reproductive Health",
  "Infectious Disease",
  "Genetics",
];

// Categories excluded from new consent grants / household delegation / health cards
// unless the patient explicitly opts them in for that specific grant (§8.3).
export const SENSITIVE_CATEGORIES = new Set([
  "Mental Health",
  "Reproductive Health",
  "Infectious Disease",
  "Genetics",
]);

export const isSensitiveCategory = (category) =>
  SENSITIVE_CATEGORIES.has(category);

// Filter a list of categories down to the non-sensitive ones (default-excluded set).
export const defaultShareableCategories = (categories = []) =>
  (categories || []).filter((c) => !SENSITIVE_CATEGORIES.has(c));

export const PROVENANCE_VALUES = [
  "patient-entered",
  "doctor-entered",
  "imported",
  "device",
];

export const DATE_PRECISION_VALUES = ["day", "month", "year"];