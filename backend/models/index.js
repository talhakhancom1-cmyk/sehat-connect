const { sequelize } = require('../config/database');

// Core identity and clinical models
const User = require('./User');
const Device = require('./Device');
const Session = require('./Session');
const PasswordReset = require('./PasswordReset');
const ApiKey = require('./ApiKey');
const EmailConfig = require('./EmailConfig');
const MfaFactor = require('./MfaFactor');
const OtpCode = require('./OtpCode');
const AuditLog = require('./AuditLog');
const DoctorCredential = require('./DoctorCredential');
const Organization = require('./Organization');
const Doctor = require('./Doctor');
const Appointment = require('./Appointment');
const MedicalRecord = require('./MedicalRecord');
const Consent = require('./Consent');
const ConsentScope = require('./ConsentScope');
const ConsentEvent = require('./ConsentEvent');
const Conversation = require('./Conversation');
const MedicationPlan = require('./MedicationPlan');
const AuditEvent = require('./AuditEvent');
const Notification = require('./Notification');
const RecordImport = require('./RecordImport');
const RecordImportFile = require('./RecordImportFile');
const RecordImportVersion = require('./RecordImportVersion');
const Prescription = require('./Prescription');
const PrescriptionItem = require('./PrescriptionItem');
const Encounter = require('./Encounter');
const IPS = require('./IPS');
const IPSSourceRecord = require('./IPSSourceRecord');
const HealthCard = require('./HealthCard');
const HealthCardToken = require('./HealthCardToken');
const HealthCardShare = require('./HealthCardShare');
const Message = require('./Message');
const CallRoom = require('./CallRoom');
const CallParticipant = require('./CallParticipant');
const UploadedFile = require('./UploadedFile');

// Household Account System (Section 25)
const Household = require('./Household');
const { HouseholdMember } = require('./HouseholdMember');
const { HouseholdInvitation } = require('./HouseholdInvitation');
const { HouseholdConsent } = require('./HouseholdConsent');
const HouseholdAuditEvent = require('./HouseholdAuditEvent');
const Delegation = require('./Delegation');

// Payment Gateway Integration and Billing (Section 26)
const { Payment } = require('./Payment');
const PaymentMethod = require('./PaymentMethod');
const Invoice = require('./Invoice');
const { Refund } = require('./Refund');
const PayoutAccount = require('./PayoutAccount');
const Schedule = require('./Schedule');

// Additional entities (Reviews, Emergency Contacts, Admin configs, Medication tracking)
const Review = require('./Review');
const EmergencyContact = require('./EmergencyContact');
const TrackingConfig = require('./TrackingConfig');
const CountryConfig = require('./CountryConfig');
const DoseEvent = require('./DoseEvent');
const Discontinuation = require('./Discontinuation');
const ConversationMember = require('./ConversationMember');
const ReminderPreference = require('./ReminderPreference');
const SymptomSession = require('./SymptomSession');
const AiConfig = require('./AiConfig');

// Identity domain associations
User.hasMany(Device, { foreignKey: 'user_id', constraints: false });
Device.belongsTo(User, { foreignKey: 'user_id', constraints: false });

User.hasMany(Session, { foreignKey: 'user_id', constraints: false });
Session.belongsTo(User, { foreignKey: 'user_id', constraints: false });

User.hasMany(PasswordReset, { foreignKey: 'user_id', constraints: false });
PasswordReset.belongsTo(User, { foreignKey: 'user_id', constraints: false });

User.hasMany(ApiKey, { foreignKey: 'created_by_user_id', as: 'apiKeys', constraints: false });
ApiKey.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'creator', constraints: false });

User.hasMany(EmailConfig, { foreignKey: 'updated_by_user_id', as: 'emailConfigs', constraints: false });
EmailConfig.belongsTo(User, { foreignKey: 'updated_by_user_id', as: 'updater', constraints: false });

User.hasMany(MfaFactor, { foreignKey: 'user_id', constraints: false });
MfaFactor.belongsTo(User, { foreignKey: 'user_id', constraints: false });

User.hasMany(DoctorCredential, { foreignKey: 'user_id', constraints: false });
DoctorCredential.belongsTo(User, { foreignKey: 'user_id', constraints: false });

Organization.hasMany(DoctorCredential, { foreignKey: 'organization_id', constraints: false });
DoctorCredential.belongsTo(Organization, { foreignKey: 'organization_id', constraints: false });

// Existing model wiring (no strict FK constraints until the schema is fully migrated)
User.hasMany(MedicalRecord, { foreignKey: 'patient_id', as: 'medicalRecords', constraints: false });
MedicalRecord.belongsTo(User, { foreignKey: 'patient_id', as: 'patient', constraints: false });

User.hasMany(Appointment, { foreignKey: 'patient_id', as: 'appointments', constraints: false });
Appointment.belongsTo(User, { foreignKey: 'patient_id', as: 'patient', constraints: false });

Doctor.hasMany(Appointment, { foreignKey: 'doctor_id', as: 'appointments', constraints: false });
Appointment.belongsTo(Doctor, { foreignKey: 'doctor_id', as: 'doctor', constraints: false });

Appointment.hasOne(Encounter, { foreignKey: 'appointment_id', as: 'encounter', constraints: false });
Encounter.belongsTo(Appointment, { foreignKey: 'appointment_id', as: 'appointment', constraints: false });

User.hasMany(RecordImport, { foreignKey: 'patient_id', as: 'recordImports', constraints: false });
RecordImport.belongsTo(User, { foreignKey: 'patient_id', as: 'patient', constraints: false });

RecordImport.hasMany(RecordImportFile, { foreignKey: 'record_import_id', as: 'files', constraints: false });
RecordImportFile.belongsTo(RecordImport, { foreignKey: 'record_import_id', as: 'recordImport', constraints: false });

RecordImport.hasMany(RecordImportVersion, { foreignKey: 'record_import_id', as: 'versions', constraints: false });
RecordImportVersion.belongsTo(RecordImport, { foreignKey: 'record_import_id', as: 'recordImport', constraints: false });

Prescription.hasMany(PrescriptionItem, { foreignKey: 'prescription_id', as: 'items', constraints: false });
PrescriptionItem.belongsTo(Prescription, { foreignKey: 'prescription_id', as: 'prescription', constraints: false });

User.hasMany(Prescription, { foreignKey: 'patient_id', as: 'prescriptions', constraints: false });
Prescription.belongsTo(User, { foreignKey: 'patient_id', as: 'patient', constraints: false });

User.hasMany(Encounter, { foreignKey: 'patient_id', as: 'encounters', constraints: false });
Encounter.belongsTo(User, { foreignKey: 'patient_id', as: 'patient', constraints: false });

User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications', constraints: false });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user', constraints: false });

Consent.hasMany(ConsentScope, { foreignKey: 'consent_id', as: 'scopes', constraints: false });
ConsentScope.belongsTo(Consent, { foreignKey: 'consent_id', as: 'consent', constraints: false });

Consent.hasMany(ConsentEvent, { foreignKey: 'consent_id', as: 'events', constraints: false });
ConsentEvent.belongsTo(Consent, { foreignKey: 'consent_id', as: 'consent', constraints: false });

// International Patient Summary (Section 17)
User.hasMany(IPS, { foreignKey: 'patient_id', as: 'ipsDocuments', constraints: false });
IPS.belongsTo(User, { foreignKey: 'patient_id', as: 'patient', constraints: false });

IPS.hasMany(IPSSourceRecord, { foreignKey: 'ips_id', as: 'sourceRecords', constraints: false });
IPSSourceRecord.belongsTo(IPS, { foreignKey: 'ips_id', as: 'ips', constraints: false });

IPSSourceRecord.belongsTo(MedicalRecord, { foreignKey: 'medical_record_id', as: 'medicalRecord', constraints: false });

// Digital Health Cards (Section 18)
User.hasMany(HealthCard, { foreignKey: 'patient_id', as: 'healthCards', constraints: false });
HealthCard.belongsTo(User, { foreignKey: 'patient_id', as: 'patient', constraints: false });

HealthCard.hasMany(HealthCardShare, { foreignKey: 'health_card_id', as: 'shares', constraints: false });
HealthCardShare.belongsTo(HealthCard, { foreignKey: 'health_card_id', as: 'healthCard', constraints: false });

// Secure Real-Time Chat (Section 19)
Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages', constraints: false });
Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation', constraints: false });

// In-House Audio and Video Calling (Section 20)
Conversation.hasMany(CallRoom, { foreignKey: 'conversation_id', as: 'callRooms', constraints: false });
CallRoom.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation', constraints: false });

CallRoom.hasMany(CallParticipant, { foreignKey: 'call_room_id', as: 'participants', constraints: false });
CallParticipant.belongsTo(CallRoom, { foreignKey: 'call_room_id', as: 'callRoom', constraints: false });

// File Upload, PDF Export and Secure Sharing (Section 21)
User.hasMany(UploadedFile, { foreignKey: 'owner_id', as: 'uploadedFiles', constraints: false });
UploadedFile.belongsTo(User, { foreignKey: 'owner_id', as: 'owner', constraints: false });

// Household Account System (Section 25)
User.hasMany(Household, { foreignKey: 'created_by_user_id', as: 'createdHouseholds', constraints: false });
Household.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'creator', constraints: false });

Household.hasMany(HouseholdMember, { foreignKey: 'household_id', as: 'members', constraints: false });
HouseholdMember.belongsTo(Household, { foreignKey: 'household_id', as: 'household', constraints: false });

Household.hasMany(HouseholdInvitation, { foreignKey: 'household_id', as: 'invitations', constraints: false });
HouseholdInvitation.belongsTo(Household, { foreignKey: 'household_id', as: 'household', constraints: false });

Household.hasMany(HouseholdConsent, { foreignKey: 'household_id', as: 'consents', constraints: false });
HouseholdConsent.belongsTo(Household, { foreignKey: 'household_id', as: 'household', constraints: false });

Household.hasMany(HouseholdAuditEvent, { foreignKey: 'household_id', as: 'auditEvents', constraints: false });
HouseholdAuditEvent.belongsTo(Household, { foreignKey: 'household_id', as: 'household', constraints: false });

// Payment Gateway Integration and Billing (Section 26)
User.hasMany(Payment, { foreignKey: 'payer_user_id', as: 'payments', constraints: false });
Payment.belongsTo(User, { foreignKey: 'payer_user_id', as: 'payer', constraints: false });
Payment.belongsTo(User, { foreignKey: 'patient_user_id', as: 'patient', constraints: false });

User.hasMany(PaymentMethod, { foreignKey: 'user_id', as: 'paymentMethods', constraints: false });
PaymentMethod.belongsTo(User, { foreignKey: 'user_id', as: 'user', constraints: false });

Payment.hasMany(Refund, { foreignKey: 'payment_id', as: 'refunds', constraints: false });
Refund.belongsTo(Payment, { foreignKey: 'payment_id', as: 'payment', constraints: false });

Payment.hasOne(Invoice, { foreignKey: 'payment_id', as: 'invoice', constraints: false });
Invoice.belongsTo(Payment, { foreignKey: 'payment_id', as: 'payment', constraints: false });

// Doctor Schedule (Section 15)
Doctor.hasMany(Schedule, { foreignKey: 'doctor_id', as: 'schedules', constraints: false });
Schedule.belongsTo(Doctor, { foreignKey: 'doctor_id', as: 'doctor', constraints: false });

// Global alias hook: inject `created_date` / `updated_date` (Base44 convention) into every
// model's JSON output so the frontend never sees `undefined` for these fields.
// This wraps any existing toJSON (e.g. User's password_hash stripping) rather than replacing it.
Object.values(sequelize.models).forEach((Model) => {
  const originalToJSON = Model.prototype.toJSON;
  Model.prototype.toJSON = function () {
    const data = originalToJSON ? originalToJSON.call(this) : { ...this.get() };
    // Only alias if the underlying timestamp exists and the frontend alias isn't already set
    if (this.dataValues && this.dataValues.created_at && data.created_date === undefined) {
      data.created_date = this.dataValues.created_at;
    }
    if (this.dataValues && this.dataValues.updated_at && data.updated_date === undefined) {
      data.updated_date = this.dataValues.updated_at;
    }
    return data;
  };
});

module.exports = {
  sequelize,
  User,
  Device,
  Session,
  PasswordReset,
  ApiKey,
  EmailConfig,
  MfaFactor,
  OtpCode,
  AuditLog,
  DoctorCredential,
  Organization,
  Doctor,
  Appointment,
  MedicalRecord,
  Consent,
  ConsentScope,
  ConsentEvent,
  Conversation,
  MedicationPlan,
  AuditEvent,
  Notification,
  RecordImport,
  RecordImportFile,
  RecordImportVersion,
  Prescription,
  PrescriptionItem,
  Encounter,
  IPS,
  IPSSourceRecord,
  HealthCard,
  HealthCardToken,
  HealthCardShare,
  Message,
  CallRoom,
  CallParticipant,
  UploadedFile,
  Household,
  HouseholdMember,
  HouseholdInvitation,
  HouseholdConsent,
  HouseholdAuditEvent,
  Delegation,
  Payment,
  PaymentMethod,
  Invoice,
  Refund,
  PayoutAccount,
  Schedule,
  Review,
  EmergencyContact,
  TrackingConfig,
  CountryConfig,
  DoseEvent,
  Discontinuation,
  ConversationMember,
  ReminderPreference,
  SymptomSession,
  AiConfig
};
