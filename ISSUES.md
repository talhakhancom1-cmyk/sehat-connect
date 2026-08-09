# Sehat Connect — Issues Audit

**Generated:** 2026-08-08
**Scope:** Full audit of the Sehat Connect frontend (`src/`) and backend (`backend/`) after two completed fix phases (Critical Security + High Broken Functionality). This document records what was fixed, what is partially fixed, and what remains outstanding.

**Status legend:** ✅ Fixed · 🟡 Partial · 🔴 Outstanding

---

## 1. Critical — Security

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1.1 | `User` model leaked `password_hash` in every JSON response (login, register, `/auth/me`, `/api/users`) | ✅ Fixed | Added `User.prototype.toJSON` override in `backend/models/User.js` that strips `password_hash`. Verified across all auth endpoints. |
| 1.2 | `/api/users` had no authentication — anyone could list users (with hashes), escalate any account to `super_admin` via `PUT` | ✅ Fixed | `backend/routes/users.js` now requires `authenticate + requireAdmin()` on `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`; `GET /:id` allows self-or-admin. |
| 1.3 | `/api/appointments` had no authentication — anyone could read/create/update/delete any appointment | ✅ Fixed | All 5 routes require `authenticate`; list/detail scoped to the requesting patient/doctor (with `Doctor` email fallback); create forces `patient_id` to caller; delete admin-only. |
| 1.4 | `/api/doctors` had no authentication | ✅ Fixed | All routes require `authenticate`; `PUT /:id` restricted to the doctor themself (`user_id` or email match) or admin; `POST`/`DELETE` admin-only. |
| 1.5 | `/api/medical-records` had no authentication — sensitive medical data readable/writable by anyone | ✅ Fixed | All routes require `authenticate`; list/detail scoped to `patient_id === req.user.id` (or admin); create forces `patient_id` to caller; update/delete admin-only. |

---

## 2. High — Broken Functionality / Data Correctness

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 2.1 | `appointments.js` ignored all query filters (`patient_id`, `doctor_id`, `status`) — "my appointments" returned everyone's | ✅ Fixed | `GET /` now applies `status`/`type`/`payment_status` filters ANDed on top of ownership scope; admins may also filter by `patient_id`/`doctor_id`. Affects: `Home.jsx`, `Appointments.jsx`, `DoctorDashboard.jsx`, `DoctorAppointments.jsx`, `DoctorPatients.jsx`, `DoctorCalendar.jsx`, `DoctorPrescriptions.jsx`, `ConsultationHistory.jsx`, `AdminDashboard.jsx`, `BookingModal.jsx`, `DoctorProfile.jsx`, `src/lib/recordAccess.js`. |
| 2.2 | `doctors.js` ignored all query filters (`specialty`, `city`, `verification_status`, `email`, `user_id`) | ✅ Fixed | `GET /` now supports `specialty`/`city`/`verification_status`/`email`/`user_id` filters + `_sort`/`_limit`. Affects: `FindDoctors.jsx` search, doctor-lookup-by-email fallback in `DoctorSchedule.jsx`, `DoctorDashboard.jsx`, `DoctorPatients.jsx`, `DoctorAppointments.jsx`, `DoctorCalendar.jsx`, `useRole.js`. |
| 2.3 | `medicalRecords.js` ignored all query filters (`patient_id`, `created_by_id`) — all patients' records mixed together | ✅ Fixed | `GET /` now scopes to `patient_id === req.user.id` for non-admins (the legacy `created_by_id` param is ignored since it isn't a real column); admins may filter by `patient_id`/`category`/`provenance`. Affects: `MedicalRecords.jsx`, `RecordTimelinePage.jsx`. |
| 2.4 | `prescriptions.js` `GET /` ignored all filters (`doctor_id`, `patient_name`) | ✅ Fixed | `GET /` now supports `doctor_id`/`patient_id`/`patient_name`/`status` filters + ownership scoping (patient sees own, doctor sees own via `Doctor` row lookup by `user_id`/email). Affects: `DoctorPrescriptions.jsx`, `Prescriptions.jsx`, `ConsultationHistory.jsx`. |
| 2.5 | `consents.js` `GET /` ignored filters (`patient_id`, `recipient_user_id`, `status`) — every authenticated user could see every patient's consents | ✅ Fixed | `GET /` now scopes non-admins to consents where they are the patient (grantor) OR the recipient, regardless of requested filters; admins may filter by `patient_id`/`recipient_user_id`/`status`. Affects: `ManageAccess.jsx`, `src/lib/recordAccess.js`. |
| 2.6 | **AuditEvent route mismatch** — frontend `base44.entities.AuditEvent` maps to `/audit-events` but backend only mounted `/api/audit` with specialized sub-routes; every `AuditEvent.create()` 404'd silently | ✅ Fixed | Added root `GET/POST /` to `backend/routes/audit.js` and mounted it at both `/api/audit` and `/api/audit-events`. Affects: `PaymentDialog.jsx`, `Household.jsx`, `HealthCards.jsx`, `ManageAccess.jsx`, `DoctorAppointments.jsx`, `src/lib/familyAccess.js`, `src/lib/audit.js`, `AdminAuditLog.jsx`. |
| 2.7 | **Encounter route mismatch** — frontend called `GET /api/encounters` (top-level) but only a nested per-appointment route existed | ✅ Fixed | New `backend/routes/encountersList.js` mounted at `/api/encounters` with ownership scoping (patient or doctor via `Doctor` row lookup). Affects: `ConsultationHistory.jsx`, `DoctorEncounters.jsx`. |
| 2.8 | **Notification entity fully stubbed client-side** — `base44Client.js` overrode `entities.Notification` with no-op stubs despite a complete backend | ✅ Fixed | Removed the stub; `Notification` now uses the real `/api/notifications` backend. Added `read`/`type` filter support and `created_date` alias to the backend route. Mapped `updateMany` → `POST /notifications/mark-all-read`. Affects: `NotificationsPage.jsx`, `src/lib/notifications.js`, every chat/payment/household/appointment notification call site. |
| 2.9 | **`verifyHealthCardToken` custom function was a stub** (always `501`) — `VerifyCard.jsx` completely non-functional | ✅ Fixed | `backend/routes/customFunctions.js` now validates the token (status/expiry/max_views), increments view count, returns the card snapshot. Verified: 3rd view on a `max_views=2` token correctly returns `410`. Affects: `VerifyCard.jsx`. |
| 2.10 | **`getFamilySharedData` custom function was a stub** (always empty) — family-shared record viewing broken | ✅ Fixed | Now resolves active, non-expired `Delegation` grants to the caller and returns real `records`/`healthCards` filtered by category/card-type scopes. Added missing `health_card_view` scope + `health_card_types` field to the `Delegation` model. Affects: `src/lib/familyAccess.js`, `SharedRecordsList.jsx`, `SharedHealthCardsList.jsx`, `FamilyShareModal.jsx`, `FamilyAuthorizations.jsx`. |
| 2.11 | **`MedicationPlan` model existed but no route was registered** — `Medications.jsx` and `DoctorPrescriptions.jsx` medication-plan CRUD 404'd silently | ✅ Fixed | New `backend/routes/medicationPlans.js` mounted at `/api/medication-plans` with ownership scoping. Affects: `Medications.jsx`, `DoctorPrescriptions.jsx`. |

---

## 3. Missing Features (no backend model or route at all)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 3.1 | **Review** (doctor ratings) — used in `DoctorProfile.jsx`, `DoctorSummary.jsx` | ✅ Built | New `backend/models/Review.js` (doctor_id, patient_id, patient_name, appointment_id, rating 1-5, comment, is_verified, date) + `backend/routes/reviews.js` (filter by doctor_id/patient_id, create, update/delete by review owner). |
| 3.2 | **EmergencyContact** — used in `Emergency.jsx` (list/create/delete) | ✅ Built | New `backend/models/EmergencyContact.js` (user_id, name, relation, phone) + `backend/routes/emergencyContacts.js` (scoped to `req.user.id`). |
| 3.3 | **TrackingConfig** — used in `AdminPixels.jsx`, `PixelTracker.jsx` | ✅ Built | New `backend/models/TrackingConfig.js` (meta_pixel_id, tiktok_pixel_id, meta_enabled, tiktok_enabled, note) + `backend/routes/trackingConfig.js` (public GET so pixels load pre-login; admin-only write). |
| 3.4 | **CountryConfig** — used in `AdminCountryConfig.jsx` | ✅ Built | New `backend/models/CountryConfig.js` (country, currency, timezone, cities, specialties, consent defaults, sensitive_categories, etc.) + `backend/routes/countryConfigs.js` (admin-only). |
| 3.5 | **DoseEvent** — used in `Medications.jsx`, `DoseLogger.jsx` (medication adherence) | ✅ Built | New `backend/models/DoseEvent.js` (medication_plan_id, patient_id, taken_at, status, source, notes) + `backend/routes/doseEvents.js` (scoped to patient). |
| 3.6 | **Discontinuation** — used in `Medications.jsx` (stopping a medication plan) | ✅ Built | New `backend/models/Discontinuation.js` (medication_plan_id, patient_id, reason, discontinued_by_*) + `backend/routes/discontinuations.js` (scoped to patient). |
| 3.7 | **ConversationMember** — used in `src/lib/conversations.js` (`bulkCreate` when starting a chat) | ✅ Built | New `backend/models/ConversationMember.js` (conversation_id, user_id, role, joined_at, status) + `backend/routes/conversationMembers.js`. |
| 3.8 | **MessageReceipt** — registered in `base44Client.js`'s entity list but **no usage found anywhere in the frontend** | 🟡 Verified unused | Confirmed via grep: `MessageReceipt` appears only in `base44Client.js` (entity name + route override) and `backend/README.md`. No page/component/lib file calls `entities.MessageReceipt.*`. No backend model or route exists. **Recommendation:** either build it out if read-receipts are planned, or remove the dead registration from `base44Client.js` to avoid confusion. No user-facing impact either way. |

---

## 4. Medium / Polish (Outstanding)

These are the remaining inconsistencies between older and newer routes. None are user-facing breakages; they're maintainability/consistency issues.

### 4.1 `_sort` support is inconsistent across routes

**Affected files:**
- `backend/routes/appointments.js` — hardcodes `ORDER BY appointment_date DESC`; ignores `_sort` param
- `backend/routes/medicalRecords.js` — hardcodes `ORDER BY date DESC`; ignores `_sort` param
- `backend/routes/prescriptions.js` — hardcodes `ORDER BY issued_at DESC`; ignores `_sort` param
- `backend/routes/consents.js` — hardcodes `ORDER BY created_at DESC`; ignores `_sort` param
- `backend/routes/notifications.js` — hardcodes `ORDER BY created_at DESC`; ignores `_sort` param
- `backend/routes/schedules.js` — hardcodes `ORDER BY updated_at DESC`; ignores `_sort` param
- `backend/routes/healthCards.js` — hardcodes `ORDER BY created_at DESC`; ignores `_sort` param
- `backend/routes/healthCardTokens.js` — hardcodes `ORDER BY created_at DESC`; ignores `_sort` param
- `backend/routes/recordImports.js` — hardcodes `ORDER BY created_at DESC`; ignores `_sort` param
- `backend/routes/ips.js` — hardcodes `ORDER BY date DESC` / `version DESC`; ignores `_sort` param
- `backend/routes/payments.js` — hardcodes `ORDER BY issued_at DESC` / `created_at DESC`; ignores `_sort` param

**Already fixed:**
- `backend/routes/doctors.js` — ✅ supports `_sort` (validated against a whitelist of real columns: `created_at`, `updated_at`, `rating`, `consultation_fee`, `experience_years`)

**Root cause:** The `base44Client.js` `filter()` helper sends `_sort` as a query param (e.g. `?_sort=-rating`), but most routes were written with a hardcoded `order:` clause and never read `req.query._sort`.

**User-facing impact:** Sort orders requested by the frontend are silently ignored. Examples:
- `Home.jsx` / `FindDoctors.jsx` request `Doctor.filter({verification_status:'verified'}, '-rating', 5)` expecting top-rated doctors first — works for doctors (fixed), but the same pattern fails elsewhere.
- `Appointments.jsx` requests `Appointment.filter(..., '-appointment_date', 50)` — happens to match the hardcoded order, so it works by coincidence.
- `Medications.jsx` requests `MedicationPlan.filter(..., '-start_date', 100)` — ignored, returns `created_at` order instead (wrong).
- `Medications.jsx` requests `DoseEvent.filter(..., '-taken_at', 500)` — ignored.
- `DoctorProfile.jsx` / `DoctorSummary.jsx` request `Review.filter(..., '-date', 50)` — ignored (returns `created_at` order).
- `ConsultationHistory.jsx` requests `Encounter.filter(..., '-encounter_date', 100)` — ignored.
- `ManageAccess.jsx` requests `Consent.filter(..., '-granted_at', 200)` — ignored.
- `HealthCards.jsx` requests `HealthCard.filter(..., '-created_date', 50)` — ignored (coincidentally matches).
- `Household.jsx` requests `HouseholdMember.filter(..., '-added_at', 50)` — ignored (coincidentally matches).
- `Household.jsx` requests `Delegation.filter(..., '-granted_at', 50)` — ignored (coincidentally matches).

**Suggested fix:** Add a small shared helper (e.g. `backend/lib/parseSort.js`) that reads `req.query._sort`, strips the leading `-` for direction, validates the field against a per-route whitelist, and falls back to the current default. Apply it to every route listed above. ~1 hour.

### 4.2 `created_date` alias is inconsistent across routes

The frontend universally uses `created_date` (Base44 convention) for display and sorting, but Sequelize's default timestamp column is `created_at`. Routes must manually alias `created_date: row.created_at` in every response.

**Affected files (missing the alias):**
- `backend/routes/appointments.js` — ✅ adds `created_date` in `GET /` list (fixed in Phase 2), but `GET /:id`, `POST /`, `PUT /:id` return raw rows without the alias
- `backend/routes/medicalRecords.js` — ✅ adds `created_date` in `GET /` list, but `GET /:id`, `POST /`, `PUT /:id` lack it
- `backend/routes/doctors.js` — ✅ adds `created_date` in `GET /` list, but `GET /:id`, `POST /`, `PUT /:id` lack it
- `backend/routes/users.js` — 🔴 no `created_date` alias anywhere (though the frontend doesn't currently display user timestamps)
- `backend/routes/prescriptions.js` — ✅ adds `created_date` + `date` (alias for `issued_at`) in `GET /` list, but `POST /` and `GET /:id` lack it
- `backend/routes/consents.js` — ✅ adds `created_date` in `GET /` list, but `POST /` and `POST /:id/revoke` lack it
- `backend/routes/schedules.js` — 🔴 no `created_date` alias anywhere
- `backend/routes/healthCards.js` — 🟡 `created_date` present in some responses but not all
- `backend/routes/payments.js` — 🔴 no `created_date` alias anywhere
- `backend/routes/recordImports.js` — 🔴 no `created_date` alias anywhere
- `backend/routes/ips.js` — 🔴 no `created_date` alias anywhere

**Already consistent:**
- `backend/routes/chat.js` — ✅ adds `created_date` everywhere
- `backend/routes/delegations.js` — ✅ adds `created_date` everywhere
- `backend/routes/householdMembers.js` — ✅ adds `created_date` everywhere
- `backend/routes/households.js` — ✅ adds `created_date` in most responses
- `backend/routes/healthCardTokens.js` — ✅ adds `created_date` everywhere
- `backend/routes/notifications.js` — ✅ adds `created_date` in `GET /` and `POST /` (fixed in Phase 2)
- All Phase 2 new routes (`reviews.js`, `emergencyContacts.js`, `trackingConfig.js`, `countryConfigs.js`, `doseEvents.js`, `discontinuations.js`, `conversationMembers.js`, `medicationPlans.js`, `encountersList.js`, `audit.js` root) — ✅ add `created_date` everywhere

**Root cause:** No shared serialization layer — each route hand-maps the alias, and it's easy to miss on non-list endpoints.

**User-facing impact:** Pages that read `item.created_date` on a single-item response (e.g. after creating or updating a record) get `undefined`, causing `moment(undefined).fromNow()` to render "Invalid date" or sort comparisons to break. Often masked because the list view (which does have the alias) re-fetches immediately after.

**Suggested fix:** Either (a) add a global Sequelize hook that injects `created_date` into every `toJSON()`, or (b) create a shared `serialize(row)` helper and use it consistently. Option (a) is a 5-line change in `models/index.js` and fixes every route at once. ~30 min.

### 4.3 Naming/route inconsistency pattern

**Root cause:** Older routes (`appointments.js`, `doctors.js`, `medicalRecords.js`, `users.js`) were written first with a simple CRUD pattern. Newer routes (`schedules.js`, `chat.js`, `payments.js`, `households.js`, `healthCards.js`, `delegations.js`, `householdMembers.js`, plus all Phase 2 routes) follow a more consistent pattern: `authenticate` + ownership scoping + query filters + `created_date` alias + `_limit` support.

**Current state after Phase 1 + Phase 2:**
- `appointments.js` — ✅ auth + ownership + filters + `_limit`; 🟡 missing `_sort` and `created_date` on non-list responses
- `doctors.js` — ✅ auth + ownership + filters + `_sort` + `_limit`; 🟡 missing `created_date` on non-list responses
- `medicalRecords.js` — ✅ auth + ownership + filters + `_limit`; 🟡 missing `_sort` and `created_date` on non-list responses
- `users.js` — ✅ auth + role checks; 🔴 no filters, no `_sort`, no `_limit`, no `created_date` (frontend doesn't need them for users today, so low priority)

**Suggested fix:** Apply the shared `parseSort` helper (4.1) and global `created_date` hook (4.2) to bring all routes to the same standard without rewriting each one individually.

---

## 5. Summary

| Category | Total | Fixed | Partial | Outstanding |
|----------|-------|-------|---------|-------------|
| Critical — Security | 5 | 5 | 0 | 0 |
| High — Broken functionality | 11 | 11 | 0 | 0 |
| Missing features | 8 | 7 | 0 | 1 (MessageReceipt — verified unused) |
| Medium — Polish | 3 | 0 | 0 | 3 (`_sort` support, `created_date` alias, naming consistency) |
| **Total** | **27** | **23** | **0** | **4** |

### Recommended next steps (in priority order):
1. **Global `created_date` hook** (4.2) — 5-line change, fixes the most user-visible "Invalid date" glitches across all routes at once.
2. **Shared `parseSort` helper** (4.1) — fixes incorrect sort ordering on `MedicationPlan`, `DoseEvent`, `Review`, `Encounter`, `Consent`, `Prescription` lists.
3. **Decide on `MessageReceipt`** (3.8) — either build it (if read-receipts are planned for chat) or remove the dead registration from `base44Client.js`.
4. **`users.js` polish** (4.3) — add filter/`_limit` support if admin user management ever needs search/pagination (currently the frontend loads all 100 and filters client-side, which is fine for small user counts).
