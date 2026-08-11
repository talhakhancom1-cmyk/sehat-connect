require('dotenv').config({ path: '.env' });
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { sequelize, testConnection, syncDatabase, createDatabase } = require('./config/database');
const { User } = require('./models');
const { attachSocketServer, buildBroadcasters } = require('./lib/realtime');
const { startScheduler } = require('./lib/scheduler');

// Fail-fast: refuse to boot in production without a real JWT secret
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-jwt-secret-do-not-use-in-production' || process.env.JWT_SECRET === 'changeme-to-a-64-char-random-string') {
    console.error('FATAL: JWT_SECRET must be set to a strong random value in production.');
    process.exit(1);
  }
  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === 'changeme') {
    console.error('FATAL: DB_PASSWORD must be set to a real password in production.');
    process.exit(1);
  }
}

const app = express();

// Trust the Nginx reverse proxy so req.ip and X-Forwarded-* are correct
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false, // Frontend is served by Nginx, not Express
}));

// CORS — locked to allowed origins (fail in production if not configured)
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin || corsOrigin === '*') {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: CORS_ORIGIN must be set to specific origins in production');
    process.exit(1);
  }
  console.warn('WARNING: CORS_ORIGIN not set, allowing all origins (development only)');
}
app.use(cors({
  origin: (!corsOrigin || corsOrigin === '*') ? true : corsOrigin.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per IP per window (login attempts, register, etc.)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

// General rate limiting (less strict)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2000, // 2000 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Migrate role columns from legacy PostgreSQL enums to strings
const migrateRoleColumns = async () => {
  try {
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_users_role'
        ) THEN
          ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(255) USING role::text;
        END IF;

        IF EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_users_app_role'
        ) THEN
          ALTER TABLE users ALTER COLUMN app_role TYPE VARCHAR(255) USING app_role::text;
        END IF;
      END $$;
    `);

    await sequelize.query(`UPDATE users SET role = 'patient' WHERE role IS NULL;`);
    await sequelize.query(`UPDATE users SET app_role = 'patient' WHERE app_role IS NULL;`);
  } catch (error) {
    console.log('ℹ️ Role column migration skipped:', error.message);
  }
};

// Add columns/enum values that were added to models after production tables
// were first created. Production sync never alters existing tables (data-loss
// risk), so any new nullable column or enum value must be migrated here —
// this keeps `git pull` + restart sufficient with no manual DB steps.
const migrateMissingColumns = async () => {
  const statements = [
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_channel VARCHAR(255);`,
    `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;`,
    `ALTER TYPE enum_messages_type ADD VALUE IF NOT EXISTS 'audio';`,
    `ALTER TYPE enum_messages_message_type ADD VALUE IF NOT EXISTS 'audio';`,
    // Schedule: per-day breaks (JSONB array of { date, start, end, reason })
    `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS day_breaks JSONB DEFAULT '[]'::jsonb;`,
    // Prescription: fields referenced by the frontend form but missing from the DB
    `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS diagnosis TEXT;`,
    `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS follow_up VARCHAR(255);`,
    `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS is_signed BOOLEAN DEFAULT false;`,
    `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;`,
    `ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS doctor_specialty VARCHAR(255);`,
    // Fix invalid date_of_birth values (e.g. year 19999) — set to NULL
    `UPDATE users SET date_of_birth = NULL WHERE date_of_birth IS NOT NULL AND (EXTRACT(YEAR FROM date_of_birth) < 1900 OR EXTRACT(YEAR FROM date_of_birth) > EXTRACT(YEAR FROM CURRENT_DATE));`,
    // OTP codes table
    `CREATE TABLE IF NOT EXISTS otp_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      code VARCHAR(10) NOT NULL,
      purpose VARCHAR(50) NOT NULL DEFAULT 'signup',
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);`,
    // must_change_password column on users
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;`,
    // permissions JSONB column on users (for support role granular permissions)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';`,
    // Audit logs table
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id UUID NOT NULL,
      actor_email VARCHAR(255),
      actor_role VARCHAR(50) NOT NULL,
      action VARCHAR(100) NOT NULL,
      target_id UUID,
      target_email VARCHAR(255),
      target_type VARCHAR(50) DEFAULT 'user',
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(45),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_id);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);`,
    // Message call-log columns (added for call logging feature)
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_direction VARCHAR(255);`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_status VARCHAR(255);`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_duration INTEGER;`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_type VARCHAR(255);`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(255);`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_by_ids TEXT;`,
    // Schedule slot duration column
    `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER NOT NULL DEFAULT 30;`,
    // Do Not Disturb flag on users
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS do_not_disturb BOOLEAN NOT NULL DEFAULT false;`,
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (error) {
      // Table/type may not exist yet on a brand-new database (sync creates it
      // with the column already present) — safe to skip.
      console.log('ℹ️ Migration statement skipped:', error.message);
    }
  }
};

// Add unique constraints to prevent duplicate records at the database level.
// These run AFTER syncDatabase so the tables exist. Partial unique indexes
// (WHERE clause) allow multiple cancelled/rejected appointments for the same
// slot while preventing double-booking active ones.
const migrateUniqueConstraints = async () => {
  // Step 1: Clean up duplicate active conversations before creating the unique
  // index. If duplicate conversations exist for the same appointment_id:
  //   a) Pick the most recently updated conversation as the "keeper"
  //   b) Move all messages from the duplicate(s) into the keeper
  //   c) Move all call_rooms from the duplicate(s) into the keeper
  //   d) Close the duplicate(s) so they're no longer active
  // This preserves all message and call history — no data is lost.
  try {
    const [duplicates] = await sequelize.query(`
      SELECT appointment_id
      FROM conversations
      WHERE appointment_id IS NOT NULL AND status = 'active'
      GROUP BY appointment_id
      HAVING count(*) > 1
    `);
    if (duplicates && duplicates.length > 0) {
      console.log(`[migration] Found ${duplicates.length} appointment(s) with duplicate active conversations — merging...`);
      for (const dup of duplicates) {
        const apptId = dup.appointment_id;
        // Find the keeper: most recently updated active conversation for this appointment
        const [keepers] = await sequelize.query(`
          SELECT id FROM conversations
          WHERE appointment_id = '${apptId}' AND status = 'active'
          ORDER BY updated_at DESC
          LIMIT 1
        `);
        if (!keepers || keepers.length === 0) continue;
        const keeperId = keepers[0].id;

        // Find all duplicate conversation IDs (all active ones except the keeper)
        const [dupRows] = await sequelize.query(`
          SELECT id FROM conversations
          WHERE appointment_id = '${apptId}' AND status = 'active' AND id != '${keeperId}'
        `);
        const dupIds = dupRows.map(r => r.id);
        if (dupIds.length === 0) continue;

        let totalMessagesMoved = 0;
        let totalCallsMoved = 0;
        for (const dupId of dupIds) {
          // Move messages from the duplicate into the keeper
          const [msgResult] = await sequelize.query(`
            UPDATE messages SET conversation_id = '${keeperId}'
            WHERE conversation_id = '${dupId}'
          `);
          totalMessagesMoved += msgResult.rowCount || 0;

          // Move call_rooms from the duplicate into the keeper
          const [callResult] = await sequelize.query(`
            UPDATE call_rooms SET conversation_id = '${keeperId}'
            WHERE conversation_id = '${dupId}'
          `);
          totalCallsMoved += callResult.rowCount || 0;

          // Close the duplicate conversation (don't delete — preserve the record)
          await sequelize.query(`
            UPDATE conversations SET status = 'closed'
            WHERE id = '${dupId}'
          `);
        }
        console.log(`[migration] Appointment ${apptId}: merged ${totalMessagesMoved} message(s) and ${totalCallsMoved} call(s) into conversation ${keeperId}, closed ${dupIds.length} duplicate(s)`);
      }
      console.log(`[migration] Duplicate conversation merge complete`);
    } else {
      console.log(`[migration] No duplicate active conversations found — skipping cleanup`);
    }
  } catch (error) {
    const fullError = error.parent?.message || error.original?.message || error.message;
    console.log('ℹ️ Duplicate conversation cleanup skipped:', fullError);
  }

  const statements = [
    // Prevent double-booking: only one active appointment per doctor+date+slot.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_active_slot
     ON appointments (doctor_id, appointment_date, time_slot)
     WHERE status IN ('pending', 'confirmed', 'in_progress');`,
    // One conversation per appointment (prevents duplicate chat threads)
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_appointment
     ON conversations (appointment_id)
     WHERE appointment_id IS NOT NULL AND status = 'active';`,
    // Prevent duplicate messages via client_message_id (idempotency)
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_message_client_id
     ON messages (conversation_id, client_message_id)
     WHERE client_message_id IS NOT NULL;`,
    // Prevent multiple active/ringing call rooms for the same conversation+initiator
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_callroom_active
     ON call_rooms (conversation_id, initiator_id)
     WHERE status IN ('ringing', 'connecting', 'active') AND conversation_id IS NOT NULL;`,
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (error) {
      // Log the FULL error (including parent/original) so we can diagnose
      // constraint creation failures, not just the truncated message.
      const fullError = error.parent?.message || error.original?.message || error.message;
      console.log(`ℹ️ Unique constraint migration skipped for: ${sql.substring(0, 60)}... — ${fullError}`);
    }
  }
};

// Initialize database
const initializeDatabase = async () => {
  try {
    const connected = await testConnection();
    if (connected) {
      await migrateRoleColumns();
      await migrateMedicalRecordEnums();
      await migrateMissingColumns();
      await syncDatabase();
      await migrateUniqueConstraints();
    } else {
      console.log('Attempting to create database...');
      await createDatabase();
      const connectedAfterCreation = await testConnection();
      if (connectedAfterCreation) {
        await syncDatabase();
      }
    }
  } catch (error) {
    console.error('Database initialization failed:', error.message);
  }
};

// Normalize legacy admin/user role values to canonical EHC roles
const migrateMedicalRecordEnums = async () => {
  try {
    const [categoryResult] = await sequelize.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'medical_records' AND column_name = 'category'
    `);
    if (categoryResult && categoryResult[0] && categoryResult[0].data_type === 'USER-DEFINED') {
      await sequelize.query(`ALTER TABLE medical_records ALTER COLUMN category TYPE VARCHAR(255) USING category::text;`);
    }

    const [provenanceResult] = await sequelize.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'medical_records' AND column_name = 'provenance'
    `);
    if (provenanceResult && provenanceResult[0] && provenanceResult[0].data_type === 'USER-DEFINED') {
      await sequelize.query(`ALTER TABLE medical_records ALTER COLUMN provenance TYPE VARCHAR(255) USING provenance::text;`);
    }
  } catch (error) {
    console.log('ℹ️ Medical record enum migration skipped:', error.message);
  }
};

const normalizeLegacyRoles = async () => {
  try {
    const legacyUsers = await User.findAll({
      where: { role: ['admin', 'user'] }
    });
    for (const user of legacyUsers) {
      const newRole = User.mapLegacyRole(user.role, user.app_role);
      user.role = newRole;
      await user.save();
    }
    if (legacyUsers.length > 0) {
      console.log(`✅ Normalized ${legacyUsers.length} legacy user role(s)`);
    }
  } catch (error) {
    console.error('❌ Legacy role normalization failed:', error.message);
  }
};

// Seed admin account from env vars (skip if not configured)
const seedAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword || adminPassword === 'changeme') {
      console.log('ℹ️  Admin seed skipped (ADMIN_EMAIL/ADMIN_PASSWORD not set in .env)');
      return;
    }
    const password_hash = await bcrypt.hash(adminPassword, 12);
    const [admin, created] = await User.findOrCreate({
      where: { email: adminEmail },
      defaults: {
        email: adminEmail,
        password_hash,
        display_name: 'Admin User',
        role: User.ROLES.SUPER_ADMIN,
        onboarded: true,
        city: 'Karachi'
      }
    });
    if (created) {
      console.log('✅ Admin user created:', admin.email);
    } else {
      console.log('✅ Admin user already exists:', admin.email);
    }
  } catch (error) {
    console.error('❌ Admin seed failed:', error.message);
  }
};

// Import routes
const appointmentRoutes = require('./routes/appointments');
const doctorRoutes = require('./routes/doctors');
const medicalRecordRoutes = require('./routes/medicalRecords');
const userRoutes = require('./routes/users');
const customFunctionRoutes = require('./routes/customFunctions');
const authRoutes = require('./routes/auth');
const timelineRoutes = require('./routes/timeline');
const { router: recordImportRoutes, patientRouter: recordImportPatientRoutes } = require('./routes/recordImports');
const prescriptionRoutes = require('./routes/prescriptions');
const encounterRoutes = require('./routes/encounters');
const consentRoutes = require('./routes/consents');
const notificationRoutes = require('./routes/notifications');
const { router: ipsRoutes, patientRouter: ipsPatientRoutes } = require('./routes/ips');
const { router: healthCardRoutes, patientRouter: healthCardPatientRoutes } = require('./routes/healthCards');
const healthCardTokenRoutes = require('./routes/healthCardTokens');
const chatRoutes = require('./routes/chat');
const callRoutes = require('./routes/calls');
const fileRoutes = require('./routes/files');
const householdRoutes = require('./routes/households');
const householdMemberRoutes = require('./routes/householdMembers');
const delegationRoutes = require('./routes/delegations');
const paymentRoutes = require('./routes/payments');
const webhookRoutes = require('./routes/webhooks');
const auditRoutes = require('./routes/audit');
const onboardingRoutes = require('./routes/onboarding');
const scheduleRoutes = require('./routes/schedules');
const reviewRoutes = require('./routes/reviews');
const emergencyContactRoutes = require('./routes/emergencyContacts');
const trackingConfigRoutes = require('./routes/trackingConfig');
const countryConfigRoutes = require('./routes/countryConfigs');
const doseEventRoutes = require('./routes/doseEvents');
const discontinuationRoutes = require('./routes/discontinuations');
const conversationMemberRoutes = require('./routes/conversationMembers');
const medicationPlanRoutes = require('./routes/medicationPlans');
const reminderPreferenceRoutes = require('./routes/reminderPreferences');
const symptomCheckerRoutes = require('./routes/symptomChecker');
const encountersListRoutes = require('./routes/encountersList');
const socketEvents = require('./lib/socketEvents');
const apiKeyRoutes = require('./routes/apiKeys');
const emailConfigRoutes = require('./routes/emailConfig');
const internalRoutes = require('./routes/internal');

// Use routes
app.use(generalLimiter); // Apply general rate limiting to all API routes

// Internal service-to-service API (protected by INTERNAL_API_SECRET, not JWT)
// Mounted before /api routes so it's not affected by API rate limiting.
app.use('/internal', internalRoutes);

// Public endpoint — returns only whether signup OTP is enabled (no auth needed)
// Used by the Register page to decide whether to show the OTP step.
app.get('/api/email-config/public-flags', async (req, res) => {
  try {
    const { EmailConfig } = require('./models');
    const config = await EmailConfig.findOne({
      where: { is_active: true },
      order: [['updated_at', 'DESC']],
    });
    res.json({
      configured: !!config,
      enable_signup_otp: config?.enable_signup_otp || false,
    });
  } catch (e) {
    res.json({ configured: false, enable_signup_otp: false });
  }
});
app.get('/api/v1/email-config/public-flags', async (req, res) => {
  try {
    const { EmailConfig } = require('./models');
    const config = await EmailConfig.findOne({
      where: { is_active: true },
      order: [['updated_at', 'DESC']],
    });
    res.json({
      configured: !!config,
      enable_signup_otp: config?.enable_signup_otp || false,
    });
  } catch (e) {
    res.json({ configured: false, enable_signup_otp: false });
  }
});

app.use('/api/appointments', appointmentRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/medical-records', medicalRecordRoutes);
app.use('/api/users', userRoutes);
app.use('/api/functions', customFunctionRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/patients/:patientId/timeline', timelineRoutes);
app.use('/api/record-imports', recordImportRoutes);
app.use('/api/patients/:patientId/record-imports', recordImportPatientRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/appointments/:appointmentId/encounter', encounterRoutes);
app.use('/api/consents', consentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/patients/:patientId/ips', ipsPatientRoutes);
app.use('/api/ips', ipsRoutes);
app.use('/api/patients/:patientId/health-cards', healthCardPatientRoutes);
app.use('/api/health-cards', healthCardRoutes);
app.use('/api/health-card-tokens', healthCardTokenRoutes);
app.use('/api', chatRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/households', householdRoutes);
app.use('/api/household-members', householdMemberRoutes);
app.use('/api/delegations', delegationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/emergency-contacts', emergencyContactRoutes);
app.use('/api/tracking-config', trackingConfigRoutes);
app.use('/api/country-configs', countryConfigRoutes);
app.use('/api/dose-events', doseEventRoutes);
app.use('/api/discontinuations', discontinuationRoutes);
app.use('/api/conversation-members', conversationMemberRoutes);
app.use('/api/medication-plans', medicationPlanRoutes);
app.use('/api/reminder-preferences', reminderPreferenceRoutes);
app.use('/api/symptom-checker', symptomCheckerRoutes);
app.use('/api/encounters', encountersListRoutes);
app.use('/api/audit-events', auditRoutes);
socketEvents.attachPlaceholder(app);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/email-config', emailConfigRoutes);

// Versioned v1 API surface (canonical per Section 10)
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/doctors', doctorRoutes);
app.use('/api/v1/medical-records', medicalRecordRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/functions', customFunctionRoutes);
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/patients/:patientId/timeline', timelineRoutes);
app.use('/api/v1/record-imports', recordImportRoutes);
app.use('/api/v1/patients/:patientId/record-imports', recordImportPatientRoutes);
app.use('/api/v1/prescriptions', prescriptionRoutes);
app.use('/api/v1/appointments/:appointmentId/encounter', encounterRoutes);
app.use('/api/v1/consents', consentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/patients/:patientId/ips', ipsPatientRoutes);
app.use('/api/v1/ips', ipsRoutes);
app.use('/api/v1/patients/:patientId/health-cards', healthCardPatientRoutes);
app.use('/api/v1/health-cards', healthCardRoutes);
app.use('/api/v1/health-card-tokens', healthCardTokenRoutes);
app.use('/api/v1', chatRoutes);
app.use('/api/v1/calls', callRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/households', householdRoutes);
app.use('/api/v1/household-members', householdMemberRoutes);
app.use('/api/v1/delegations', delegationRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/schedules', scheduleRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/emergency-contacts', emergencyContactRoutes);
app.use('/api/v1/tracking-config', trackingConfigRoutes);
app.use('/api/v1/country-configs', countryConfigRoutes);
app.use('/api/v1/dose-events', doseEventRoutes);
app.use('/api/v1/discontinuations', discontinuationRoutes);
app.use('/api/v1/conversation-members', conversationMemberRoutes);
app.use('/api/v1/medication-plans', medicationPlanRoutes);
app.use('/api/v1/reminder-preferences', reminderPreferenceRoutes);
app.use('/api/v1/symptom-checker', symptomCheckerRoutes);
app.use('/api/v1/encounters', encountersListRoutes);
app.use('/api/v1/audit-events', auditRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);
app.use('/api/v1/email-config', emailConfigRoutes);

// Health check endpoint
const healthHandler = async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      database_type: 'PostgreSQL',
      message: 'All systems operational'
    });
  } catch (error) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      database_type: 'PostgreSQL',
      message: 'Database not connected - some endpoints will not work',
      error: error.message
    });
  }
};

app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Attach Socket.IO realtime server
const io = attachSocketServer(server, corsOrigin);
const broadcasters = buildBroadcasters(io);
app.set('io', io);
app.set('broadcasters', broadcasters);

const start = async () => {
  await initializeDatabase();
  await normalizeLegacyRoles();
  await seedAdmin();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server attached at /ws`);
  });
  // Start background job scheduler (reminders, expiry, cleanup)
  startScheduler(io);
};
start();

module.exports = app;
