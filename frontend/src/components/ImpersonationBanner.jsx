import React, { useState } from 'react';
import { ShieldAlert, X, Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Persistent yellow banner shown when an admin is impersonating a user.
 * Displays admin name + impersonated user name + "End Impersonation" button.
 * The admin's original token is stored in localStorage as 'ehc_admin_token'
 * when impersonation starts, so we can restore it on end.
 */
export default function ImpersonationBanner({ user, onEnd }) {
  const [ending, setEnding] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (!user?._impersonating || hidden) return null;

  const handleEnd = async () => {
    setEnding(true);
    try {
      const adminToken = localStorage.getItem('ehc_admin_token');
      const res = await fetch(`${API_BASE_URL}/auth/end-impersonation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ehc_token')}`,
        },
        body: JSON.stringify({ adminToken }),
      });
      const data = await res.json();
      if (data.token) {
        // Restore admin token
        localStorage.setItem('ehc_token', data.token);
        localStorage.removeItem('ehc_admin_token');
        window.location.href = '/admin';
      } else {
        // Admin session expired — go to login
        localStorage.removeItem('ehc_token');
        localStorage.removeItem('ehc_admin_token');
        window.location.href = '/login';
      }
      onEnd?.();
    } catch (err) {
      console.error('End impersonation error:', err);
      localStorage.removeItem('ehc_token');
      localStorage.removeItem('ehc_admin_token');
      window.location.href = '/login';
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="sticky top-0 z-[100] bg-amber-500 text-white px-4 py-2 flex items-center justify-between gap-3 shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>
          Impersonating <strong>{user.display_name || user.email}</strong>
          <span className="hidden sm:inline"> — Admin: <strong>{user._admin_name || user._admin_email}</strong></span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleEnd}
          disabled={ending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-xs font-semibold disabled:opacity-60"
        >
          {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          End Impersonation
        </button>
      </div>
    </div>
  );
}
