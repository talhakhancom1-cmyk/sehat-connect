// Canonical constants from the Eco Health Cloud Engineering Bible.
// These should be used as the single source of truth for roles, record
// categories, provenance values and standard error codes.

const ROLES = {
  PATIENT: 'patient',
  HEAD_OF_HOUSEHOLD: 'head_of_household',
  DOCTOR: 'doctor',
  CAREGIVER: 'caregiver',
  CLINIC_ADMIN: 'clinic_admin',
  SUPPORT_AGENT: 'support_agent',
  COMPLIANCE_AUDITOR: 'compliance_auditor',
  SUPER_ADMIN: 'super_admin'
};

const ROLE_VALUES = Object.values(ROLES);

const END_USER_ROLES = [
  ROLES.PATIENT,
  ROLES.HEAD_OF_HOUSEHOLD,
  ROLES.DOCTOR,
  ROLES.CAREGIVER
];

const ADMIN_ROLES = [
  ROLES.CLINIC_ADMIN,
  ROLES.SUPPORT_AGENT,
  ROLES.COMPLIANCE_AUDITOR,
  ROLES.SUPER_ADMIN
];

const CLINICAL_ROLES = [ROLES.DOCTOR, ROLES.CAREGIVER];

const RECORD_CATEGORIES = [
  { key: 'allergies_intolerances', label: 'Allergies & Intolerances', sensitive: false },
  { key: 'current_medications', label: 'Current Medications', sensitive: false },
  { key: 'previous_medications', label: 'Previous Medications', sensitive: false },
  { key: 'diagnoses', label: 'Diagnoses', sensitive: false },
  { key: 'laboratory_results', label: 'Laboratory Results', sensitive: false },
  { key: 'imaging', label: 'Imaging', sensitive: false },
  { key: 'vaccinations', label: 'Vaccinations', sensitive: false },
  { key: 'procedures_surgeries', label: 'Procedures & Surgeries', sensitive: false },
  { key: 'mental_health', label: 'Mental Health Records', sensitive: true },
  { key: 'reproductive_health', label: 'Reproductive Health Records', sensitive: true },
  { key: 'infectious_disease', label: 'Infectious Disease Records', sensitive: true },
  { key: 'genetic_information', label: 'Genetic Information', sensitive: true },
  { key: 'wearable_data', label: 'Wearable Data', sensitive: false },
  { key: 'medication_adherence', label: 'Medication-Adherence Data', sensitive: false },
  { key: 'uploaded_documents', label: 'Uploaded Documents', sensitive: false },
  { key: 'chat_clinical_notes', label: 'Chat-Derived Clinical Notes', sensitive: false }
];

const SENSITIVE_CATEGORIES = RECORD_CATEGORIES
  .filter(c => c.sensitive)
  .map(c => c.key);

const PROVENANCE = {
  PATIENT_UPLOADED: 'patient_uploaded',
  CAREGIVER_UPLOADED: 'caregiver_uploaded',
  CLINICIAN_ENTERED: 'clinician_entered',
  CLINICIAN_VERIFIED: 'clinician_verified',
  LABORATORY_UPLOADED: 'laboratory_uploaded',
  DEVICE_GENERATED: 'device_generated',
  IMPORTED_APPLE_HEALTH: 'imported_apple_health',
  IMPORTED_HEALTH_CONNECT: 'imported_health_connect'
};

const PROVENANCE_VALUES = Object.values(PROVENANCE);

// Clinician-entered is the highest trust tier and cannot be upgraded.
const CAN_VERIFY_TO_CLINICIAN = [
  PROVENANCE.PATIENT_UPLOADED,
  PROVENANCE.CAREGIVER_UPLOADED,
  PROVENANCE.LABORATORY_UPLOADED,
  PROVENANCE.DEVICE_GENERATED,
  PROVENANCE.IMPORTED_APPLE_HEALTH,
  PROVENANCE.IMPORTED_HEALTH_CONNECT
];

const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  CONSENT_EXPIRED: 'CONSENT_EXPIRED',
  SCOPE_DENIED: 'SCOPE_DENIED',
  ROLE_DENIED: 'ROLE_DENIED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  SLOT_ALREADY_BOOKED: 'SLOT_ALREADY_BOOKED',
  DUPLICATE_CLIENT_MESSAGE: 'DUPLICATE_CLIENT_MESSAGE',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  CLINICAL_RULE_FAILED: 'CLINICAL_RULE_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  MEDIA_REGION_UNAVAILABLE: 'MEDIA_REGION_UNAVAILABLE',
  EXPORT_QUEUE_UNAVAILABLE: 'EXPORT_QUEUE_UNAVAILABLE'
};

module.exports = {
  ROLES,
  ROLE_VALUES,
  END_USER_ROLES,
  ADMIN_ROLES,
  CLINICAL_ROLES,
  RECORD_CATEGORIES,
  SENSITIVE_CATEGORIES,
  PROVENANCE,
  PROVENANCE_VALUES,
  CAN_VERIFY_TO_CLINICIAN,
  ERROR_CODES
};
