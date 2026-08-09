// Centralized role + doctor-profile access for the whole app.
// Resolves the current user's portal role from the canonical EHC role set
// defined in Section 4 of the Engineering Bible.

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

export const EHC_ROLES = {
  PATIENT: 'patient',
  HEAD_OF_HOUSEHOLD: 'head_of_household',
  DOCTOR: 'doctor',
  CAREGIVER: 'caregiver',
  CLINIC_ADMIN: 'clinic_admin',
  SUPPORT_AGENT: 'support_agent',
  COMPLIANCE_AUDITOR: 'compliance_auditor',
  SUPER_ADMIN: 'super_admin',
};

export const ADMIN_ROLES = [
  EHC_ROLES.CLINIC_ADMIN,
  EHC_ROLES.SUPPORT_AGENT,
  EHC_ROLES.COMPLIANCE_AUDITOR,
  EHC_ROLES.SUPER_ADMIN,
];

export function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

export function isDoctor(role, appRole) {
  return role === EHC_ROLES.DOCTOR || appRole === 'doctor';
}

export function useRole() {
  const { user } = useAuth();
  const portalRole =
    isAdmin(user?.role)
      ? 'admin'
      : isDoctor(user?.role, user?.app_role)
        ? 'doctor'
        : 'patient';
  return {
    role: portalRole,
    isPatient: portalRole === 'patient',
    isDoctor: portalRole === 'doctor',
    isAdmin: portalRole === 'admin',
    user,
  };
}

// Loads the Doctor entity belonging to the current doctor user (matched by email).
// Used to gate clinical actions on verification_status and to drive the
// verification banner / workflow.
export function useDoctorProfile() {
  const { user } = useAuth();
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    let active = true;
    (async () => {
      try {
        const docs = await base44.entities.Doctor.filter({ email: user.email });
        if (active) setDoctor(docs[0] || null);
      } catch {
        if (active) setDoctor(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.email]);

  return {
    doctor,
    loading,
    isVerified: doctor?.verification_status === 'verified',
    isPending: doctor?.verification_status === 'pending',
    isSuspended: doctor?.verification_status === 'suspended',
  };
}