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

// CORS — locked to allowed origins
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP per window (login attempts, register, etc.)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

// General rate limiting (less strict)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Initialize database
const initializeDatabase = async () => {
  try {
    const connected = await testConnection();
    if (connected) {
      await migrateRoleColumns();
      await migrateMedicalRecordEnums();
      await syncDatabase();
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
const encountersListRoutes = require('./routes/encountersList');
const socketEvents = require('./lib/socketEvents');
const apiKeyRoutes = require('./routes/apiKeys');

// Use routes
app.use(generalLimiter); // Apply general rate limiting to all API routes
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
app.use('/api/encounters', encountersListRoutes);
app.use('/api/audit-events', auditRoutes);
socketEvents.attachPlaceholder(app);
app.use('/api/api-keys', apiKeyRoutes);

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
app.use('/api/v1/encounters', encountersListRoutes);
app.use('/api/v1/audit-events', auditRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);

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
