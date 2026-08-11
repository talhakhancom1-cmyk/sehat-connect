import { onMessageNew } from '@/lib/socketClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'ehc_token';
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body
  }

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const ENTITY_ROUTE_OVERRIDES = {
  MedicalRecord: 'medical-records',
  HealthCard: 'health-cards',
  HealthCardToken: 'health-card-tokens',
  HouseholdMember: 'household-members',
  EmergencyContact: 'emergency-contacts',
  MedicationPlan: 'medication-plans',
  ConversationMember: 'conversation-members',
  TrackingConfig: 'tracking-config',
  CountryConfig: 'country-configs',
  DoseEvent: 'dose-events',
  AuditEvent: 'audit-events',
};

function routeFor(entityName) {
  if (ENTITY_ROUTE_OVERRIDES[entityName]) return ENTITY_ROUTE_OVERRIDES[entityName];
  return entityName.charAt(0).toLowerCase() + entityName.slice(1) + 's';
}

/**
 * Normalise the API response into a plain array.
 *
 * Before pagination was added, list endpoints returned a bare array `[...]`.
 * After pagination, they return `{ data: [...], total_count, page, ... }`.
 * This helper accepts both shapes and always returns an array, so frontend
 * code can keep calling `.filter()`, `.map()`, etc. without breaking.
 */
function toArray(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.data)) return resp.data;
  return [];
}

function makeEntityClient(entityName) {
  const base = `/${routeFor(entityName)}`;
  return {
    list: async (sort, limit) => {
      const params = new URLSearchParams();
      if (sort) params.append('_sort', sort);
      if (limit) params.append('_limit', String(limit));
      const qs = params.toString();
      return toArray(await request(qs ? `${base}?${qs}` : base));
    },
    filter: async (filterObj, sort, limit) => {
      const params = new URLSearchParams();
      if (filterObj && typeof filterObj === 'object') {
        for (const [key, value] of Object.entries(filterObj)) {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        }
      }
      if (sort) params.append('_sort', sort);
      if (limit) params.append('_limit', String(limit));
      const qs = params.toString();
      const resp = await request(qs ? `${base}?${qs}` : base);
      return toArray(resp);
    },
    get: (id) => request(`${base}/${id}`),
    create: (data) => request(base, { method: 'POST', body: data }),
    update: (id, data) => request(`${base}/${id}`, { method: 'PUT', body: data }),
    updateMany: () => Promise.resolve({ count: 0 }),
    delete: (id) => request(`${base}/${id}`, { method: 'DELETE' }),
    bulkCreate: (items) => Promise.all(items.map((item) => request(base, { method: 'POST', body: item }))),
    // Real-time subscription — only Message has a live backend event (message:new
    // over Socket.IO, see lib/socketClient.js). Other entities fall back to a no-op
    // so callers using the same interface don't crash; they should poll instead.
    subscribe: entityName === 'Message'
      ? (callback) => onMessageNew((message) => callback({ type: 'create', data: message }))
      : () => {
          console.warn(`${entityName}.subscribe is not supported by the local backend`);
          return () => {};
        },
  };
}

const ENTITY_NAMES = [
  'User', 'Doctor', 'Appointment', 'MedicalRecord', 'Prescription', 'HealthCard', 'HealthCardToken',
  'Household', 'HouseholdMember', 'Delegation', 'Encounter', 'Notification', 'Payment', 'Review',
  'Consent', 'AuditEvent', 'EmergencyContact', 'Discontinuation', 'DoseEvent',
  'MedicationPlan', 'Schedule', 'Conversation', 'ConversationMember', 'Message', 'TrackingConfig',
  'CountryConfig', 'ReminderPreference',
];

const entities = {};
ENTITY_NAMES.forEach((name) => {
  entities[name] = makeEntityClient(name);
});

// Notification.updateMany maps to the dedicated mark-all-read endpoint — the generic
// entity client has no bulk-update route, but this is the only bulk update ever used.
entities.Notification.updateMany = () => request('/notifications/mark-all-read', { method: 'POST' });

const auth = {
  async me() {
    return request('/auth/me');
  },
  async login(email, password) {
    const data = await request('/auth/login', { method: 'POST', body: { email, password } });
    if (data?.token) setToken(data.token);
    return data;
  },
  async register(email, password, fullName, role) {
    let body;
    if (typeof email === 'object' && email !== null) {
      body = email;
    } else {
      body = { email, password, fullName, role };
    }
    const data = await request('/auth/register', { method: 'POST', body });
    if (data?.token) setToken(data.token);
    return data;
  },
  loginViaEmailPassword(email, password) {
    return auth.login(email, password);
  },
  loginWithProvider(provider) {
    console.warn(`Provider login (${provider}) is not supported by the local backend`);
  },
  logout(redirectUrl) {
    setToken(null);
    if (redirectUrl) window.location.href = '/login';
  },
  redirectToLogin(returnTo) {
    window.location.href = `/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`;
  },
  async updateMe(data) {
    return request('/auth/me', { method: 'PUT', body: data });
  },
  async resetPasswordRequest(email) {
    return request('/auth/forgot-password', { method: 'POST', body: { email } });
  },
  async resetPassword({ resetToken, newPassword } = {}) {
    return request('/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: newPassword },
    });
  },
  async changePassword({ currentPassword, newPassword } = {}) {
    return request('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  },
  async verifyResetToken(token) {
    return request('/auth/verify-reset-token', { method: 'POST', body: { token } });
  },
  isAuthenticated() {
    return !!getToken();
  },
  getToken,
  setToken,
};

const functions = {
  invoke: (name, data) => request(`/functions/${name}`, { method: 'POST', body: data }),
};

const integrations = {
  Core: {
    UploadFile: async ({ file } = {}) => {
      if (!file) throw new Error('No file provided');
      const formData = new FormData();
      formData.append('file', file);
      const token = getToken();
      const resp = await fetch(`${API_BASE_URL}/files/upload`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
      let data = null;
      try { data = await resp.json(); } catch { /* no JSON */ }
      if (!resp.ok) {
        const err = new Error(data?.error || `Upload failed (${resp.status})`);
        err.status = resp.status;
        throw err;
      }
      // Build the full download URL with token
      const baseUrl = API_BASE_URL.replace(/\/api$/, '');
      const fullUrl = data.download_token
        ? `${baseUrl}${data.file_url}?token=${data.download_token}`
        : `${baseUrl}${data.file_url}`;
      return { ...data, file_url: fullUrl };
    },
    ExtractDataFromUploadedFile: () => {
      console.warn('ExtractDataFromUploadedFile is a stub in the local backend');
      return Promise.resolve({ text: '' });
    },
  },
};

// Exposed for custom (non-CRUD) endpoints that aren't covered by the entity
// client, e.g. PUT /api/dose-events/:id/status or GET /api/dose-events/adherence.
const apiUrl = API_BASE_URL;
const headers = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const base44 = { auth, entities, functions, integrations, apiUrl, headers };
