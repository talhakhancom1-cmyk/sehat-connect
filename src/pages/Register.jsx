import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, User, Stethoscope, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function apiRequest(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('ehc_token');
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export default function Register() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("patient");

  // OTP state
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpStep, setOtpStep] = useState(false); // false = registration form, true = OTP input
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  const otpInputRef = useRef(null);

  // Check if OTP is enabled on mount
  useEffect(() => {
    apiRequest('/email-config').then((data) => {
      if (data.configured && data.enable_signup_otp) {
        setOtpRequired(true);
      }
    }).catch(() => { /* ignore — if we can't check, just skip OTP */ });
  }, []);

  // Resend timer countdown
  useEffect(() => {
    if (otpResendTimer <= 0) return;
    const t = setInterval(() => setOtpResendTimer((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [otpResendTimer]);

  // Focus OTP input when step changes
  useEffect(() => {
    if (otpStep && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [otpStep]);

  const sendOtp = async (emailToSend) => {
    setOtpSending(true);
    setError("");
    try {
      await apiRequest('/auth/request-otp', { method: 'POST', body: { email: emailToSend, purpose: 'signup' } });
      setOtpResendTimer(60); // 60 second cooldown
      toast({ title: "OTP sent", description: `A verification code was sent to ${emailToSend}` });
    } catch (err) {
      setError(err.message || "Could not send OTP");
      throw err;
    } finally {
      setOtpSending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    // If OTP is required, send OTP and switch to OTP step
    if (otpRequired && !otpStep) {
      try {
        await sendOtp(email);
        setOtpStep(true);
      } catch (err) {
        // OTP sending failed — fall back to direct registration
        setError(`Could not send verification email: ${err.message}. You can still register without OTP.`);
        setOtpRequired(false);
      }
      return;
    }

    setLoading(true);
    try {
      const result = await base44.auth.register({ email, password, fullName, role });
      if (result?.token) {
        toast({ title: "Account created", description: "Let's complete your profile." });
        window.location.href = `/onboarding?role=${role}`;
      } else {
        setError("Registration succeeded but no token received. Please log in.");
        setTimeout(() => navigate("/login"), 1500);
      }
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    if (!otpCode || otpCode.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      // Verify the OTP
      await apiRequest('/auth/verify-otp', { method: 'POST', body: { email, code: otpCode, purpose: 'signup' } });
      // OTP verified — proceed with registration
      const result = await base44.auth.register({ email, password, fullName, role });
      if (result?.token) {
        toast({ title: "Account created", description: "Email verified. Let's complete your profile." });
        window.location.href = `/onboarding?role=${role}`;
      } else {
        setError("Registration succeeded but no token received. Please log in.");
        setTimeout(() => navigate("/login"), 1500);
      }
    } catch (err) {
      setError(err.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResendTimer > 0) return;
    try {
      await sendOtp(email);
    } catch (err) {
      setError(err.message || "Could not resend OTP");
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", safeReturnTo());
  };

  // OTP verification step
  if (otpStep) {
    return (
      <AuthLayout
        icon={ShieldCheck}
        title="Verify your email"
        subtitle={`Enter the 6-digit code sent to ${email}`}
        footer={
          <button
            type="button"
            onClick={() => { setOtpStep(false); setOtpCode(""); setError(""); }}
            className="text-primary font-medium hover:underline"
          >
            Back to registration
          </button>
        }
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Verification Code</Label>
            <Input
              id="otp"
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              className="h-14 text-center text-2xl font-bold tracking-[0.5em]"
              required
            />
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Create Account"
            )}
          </Button>
        </form>

        <div className="mt-4 text-center">
          {otpResendTimer > 0 ? (
            <p className="text-xs text-muted-foreground">
              Resend code in {otpResendTimer}s
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResendOtp}
              className="text-sm text-primary font-medium hover:underline"
            >
              Resend code
            </button>
          )}
        </div>
      </AuthLayout>
    );
  }

  // Normal registration form
  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          type="button"
          onClick={() => setRole("patient")}
          className={cn(
            "flex items-center justify-center gap-2 h-11 rounded-lg border text-sm font-medium transition-all",
            role === "patient" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          )}
        >
          <User className="w-4 h-4" />
          Patient
        </button>
        <button
          type="button"
          onClick={() => setRole("doctor")}
          className={cn(
            "flex items-center justify-center gap-2 h-11 rounded-lg border text-sm font-medium transition-all",
            role === "doctor" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          )}
        >
          <Stethoscope className="w-4 h-4" />
          Doctor
        </button>
      </div>

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
          <Label htmlFor="fullName">Full Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              autoFocus
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || otpSending}>
          {loading || otpSending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {otpSending ? "Sending verification code..." : "Creating account..."}
            </>
          ) : otpRequired ? (
            "Send verification code"
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
