import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";
import { isAdmin, isDoctor } from "@/lib/useRole";
import { validateEmail, validateRequired } from "@/lib/validate";

function portalFor(user) {
  if (!user) return '/';
  if (isAdmin(user.role)) return '/admin';
  if (isDoctor(user.role, user.app_role)) return '/doctor';
  return '/';
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const returnTo = safeReturnTo();
  const isTestMode = import.meta.env.VITE_TEST_MODE === 'true';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    // Frontend validation before any API call.
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    const pwErr = validateRequired(password, "Password");
    if (pwErr) { setError(pwErr); return; }
    setLoading(true);

    if (isTestMode) {
      try {
        localStorage.setItem('test_user_id', 'aa68400e-a83a-44a7-92a1-6e9123752eba');
        localStorage.setItem('test_user_role', 'patient');
        window.location.href = returnTo;
      } catch (err) {
        setError(err.message || "Login failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const result = await base44.auth.loginViaEmailPassword(email, password);
      // Redirect to the correct portal based on role (unless a specific returnTo was requested)
      const dest = returnTo && returnTo !== '/' ? returnTo : portalFor(result?.user);
      window.location.href = dest;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    if (isTestMode) {
      // In test mode, simulate Google login
      localStorage.setItem('test_user_id', 'aa68400e-a83a-44a7-92a1-6e9123752eba');
      localStorage.setItem('test_user_role', 'patient');
      window.location.href = returnTo;
      return;
    }
    base44.auth.loginWithProvider("google", returnTo);
  };

  const handleTestLogin = (role) => {
    const testUsers = {
      patient: 'aa68400e-a83a-44a7-92a1-6e9123752eba',
      doctor: '3d0906fa-f6a5-44a6-8a07-f676fbd4a6a3',
      admin: 'ea671316-e20c-4fc0-a717-ce35cb3987d6'
    };
    
    localStorage.setItem('test_user_id', testUsers[role]);
    localStorage.setItem('test_user_role', role);
    window.location.href = returnTo;
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      {isTestMode && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">🧪 Test Mode</h3>
          <p className="text-sm text-blue-700 mb-3">Quick login for testing:</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestLogin('patient')}
              className="text-xs"
            >
              Patient
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestLogin('doctor')}
              className="text-xs"
            >
              Doctor
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestLogin('admin')}
              className="text-xs"
            >
              Admin
            </Button>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required={!isTestMode}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required={!isTestMode}
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
