const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

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

const END_USER_ROLES = [ROLES.PATIENT, ROLES.HEAD_OF_HOUSEHOLD, ROLES.DOCTOR, ROLES.CAREGIVER];
const ADMIN_ROLES = [ROLES.CLINIC_ADMIN, ROLES.SUPPORT_AGENT, ROLES.COMPLIANCE_AUDITOR, ROLES.SUPER_ADMIN];
const CLINICAL_ROLES = [ROLES.DOCTOR, ROLES.CAREGIVER];
const RECORD_ACCESS_ROLES = [ROLES.PATIENT, ROLES.HEAD_OF_HOUSEHOLD, ROLES.DOCTOR, ROLES.CAREGIVER];

function mapLegacyRole(role, appRole) {
  if (role === 'admin') return ROLES.SUPER_ADMIN;
  if (role === 'user') {
    return appRole === 'doctor' ? ROLES.DOCTOR : ROLES.PATIENT;
  }
  return role;
}

function deriveAppRole(role) {
  return role === ROLES.DOCTOR ? 'doctor' : 'patient';
}

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: ROLES.PATIENT,
    allowNull: false,
    validate: {
      isIn: {
        args: [ROLE_VALUES],
        msg: `Role must be one of: ${ROLE_VALUES.join(', ')}`
      }
    }
  },
  app_role: {
    type: DataTypes.STRING,
    defaultValue: 'patient',
    allowNull: false,
    validate: {
      isIn: {
        args: [['patient', 'doctor']],
        msg: 'app_role must be patient or doctor'
      }
    }
  },
  onboarded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  display_name: {
    type: DataTypes.STRING
  },
  phone: {
    type: DataTypes.STRING
  },
  address: {
    type: DataTypes.TEXT
  },
  city: {
    type: DataTypes.STRING
  },
  country: {
    type: DataTypes.STRING,
    defaultValue: 'Pakistan'
  },
  profile_pic_url: {
    type: DataTypes.STRING
  },
  date_of_birth: {
    type: DataTypes.DATEONLY
  },
  age: {
    type: DataTypes.INTEGER
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'other')
  },
  blood_type: {
    type: DataTypes.STRING
  },
  allergies: {
    type: DataTypes.TEXT
  },
  emergency_contact_name: {
    type: DataTypes.STRING
  },
  emergency_contact_phone: {
    type: DataTypes.STRING
  },
  specialty: {
    type: DataTypes.STRING
  },
  pmdc_number: {
    type: DataTypes.STRING
  },
  consultation_fee: {
    type: DataTypes.DECIMAL(10, 2)
  },
  experience_years: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  bio: {
    type: DataTypes.TEXT
  },
  verification_status: {
    type: DataTypes.ENUM('pending', 'verified', 'suspended'),
    defaultValue: 'pending'
  },
  must_change_password: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Granular permissions for support/admin roles. Keys: can_view_users, can_reset_passwords, can_impersonate, can_view_tickets, can_view_medical_data'
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeValidate: (user) => {
      if (user.role) {
        user.role = mapLegacyRole(user.role, user.app_role);
      } else {
        user.role = ROLES.PATIENT;
      }
      user.app_role = deriveAppRole(user.role);
    }
  }
});

User.ROLES = ROLES;
User.ROLE_VALUES = ROLE_VALUES;
User.END_USER_ROLES = END_USER_ROLES;
User.ADMIN_ROLES = ADMIN_ROLES;
User.CLINICAL_ROLES = CLINICAL_ROLES;
User.RECORD_ACCESS_ROLES = RECORD_ACCESS_ROLES;

User.prototype.isPatient = function () { return this.role === ROLES.PATIENT || this.role === ROLES.HEAD_OF_HOUSEHOLD; };
User.prototype.isDoctor = function () { return this.role === ROLES.DOCTOR; };
User.prototype.isHeadOfHousehold = function () { return this.role === ROLES.HEAD_OF_HOUSEHOLD; };
User.prototype.isCaregiver = function () { return this.role === ROLES.CAREGIVER; };
User.prototype.isClinicAdmin = function () { return this.role === ROLES.CLINIC_ADMIN; };
User.prototype.isSupportAgent = function () { return this.role === ROLES.SUPPORT_AGENT; };
User.prototype.isAuditor = function () { return this.role === ROLES.COMPLIANCE_AUDITOR; };
User.prototype.isSuperAdmin = function () { return this.role === ROLES.SUPER_ADMIN; };
User.prototype.isAdmin = function () { return ADMIN_ROLES.includes(this.role); };
User.prototype.hasClinicalAccess = function () { return CLINICAL_ROLES.includes(this.role); };
User.prototype.canViewOwnOrDependentRecords = function () { return RECORD_ACCESS_ROLES.includes(this.role); };
User.prototype.canManageHousehold = function () { return this.role === ROLES.HEAD_OF_HOUSEHOLD || this.role === ROLES.CAREGIVER || ADMIN_ROLES.includes(this.role); };

User.mapLegacyRole = mapLegacyRole;
User.deriveAppRole = deriveAppRole;

// Never leak the bcrypt hash in any JSON response (login, register, /auth/me, /api/users, etc.)
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password_hash;
  return values;
};

module.exports = User;
