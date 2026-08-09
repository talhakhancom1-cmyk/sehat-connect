import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { createNotification } from '@/lib/notifications';
import { useToast } from '@/components/ui/use-toast';
import { X, CreditCard, Wallet, Building2, Banknote, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const methods = [
  { id: 'jazzcash', label: 'JazzCash', icon: Wallet, hint: 'Mobile wallet' },
  { id: 'easypaisa', label: 'Easypaisa', icon: Wallet, hint: 'Mobile wallet' },
  { id: 'card', label: 'Debit / Credit Card', icon: CreditCard, hint: 'Visa, Mastercard' },
  { id: 'bank_transfer', label: 'Bank Transfer', icon: Building2, hint: 'IBAN' },
  { id: 'cash', label: 'Cash at Clinic', icon: Banknote, hint: 'Pay on arrival' },
];

export default function PaymentDialog({ appointment, open, onClose, onPaid }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [method, setMethod] = useState('jazzcash');
  const [processing, setProcessing] = useState(false);

  if (!open || !appointment) return null;

  const fee = Number(appointment.consultation_fee || 0);
  const isCash = method === 'cash';

  const pay = async () => {
    setProcessing(true);
    try {
      // Dummy payment flow — no real gateway, just record and continue.
      // Real gateway integration will be added in the future.
      const now = new Date().toISOString();
      // 1. Record the Payment
      await base44.entities.Payment.create({
        provider: isCash ? 'cash' : method,
        amount: fee,
        currency: 'PKR',
        status: isCash ? 'pending' : 'captured',
        appointment_id: appointment.id,
        patient_id: appointment.patient_id || user?.id,
        patient_name: appointment.patient_name,
        payer_id: user?.id,
        payer_name: user?.full_name || appointment.patient_name,
        method: isCash ? 'cash' : method,
        paid_at: isCash ? null : now,
        idempotency_key: `pay-${appointment.id}-${Date.now()}`,
      });

      // 2. Mark the appointment paid (unblocks the doctor confirm gate)
      await base44.entities.Appointment.update(appointment.id, {
        payment_status: isCash ? 'unpaid' : 'paid',
        payment_method: method,
      });

      // 3. Audit
      try {
        await base44.entities.AuditEvent.create({
          actor_user_id: user?.id,
          actor_role: 'patient',
          action: 'payment_marked_paid',
          target_type: 'Payment',
          target_id: appointment.id,
          patient_id: appointment.patient_id || user?.id,
          detail: `${isCash ? 'Cash recorded (pending)' : 'Payment captured (dummy)'} via ${method} for ${appointment.doctor_name}`,
        });
      } catch (e) { console.error('Audit log failed', e); }

      // 4. Notify the patient
      if (isCash) {
        await createNotification(user?.id, 'payment', 'Cash payment recorded', `Pay Rs ${fee.toLocaleString()} at the clinic for your appointment with ${appointment.doctor_name}.`, { data: { appointment_id: appointment.id } });
      } else {
        await createNotification(user?.id, 'payment', 'Payment successful', `Rs ${fee.toLocaleString()} paid for your appointment with ${appointment.doctor_name}. The doctor will confirm shortly.`, { data: { appointment_id: appointment.id } });
      }

      toast({
        title: isCash ? 'Cash payment noted' : 'Payment successful',
        description: isCash ? `Pay Rs ${fee.toLocaleString()} at the clinic. The doctor will confirm once received.` : `Rs ${fee.toLocaleString()} paid. ${appointment.doctor_name} can now confirm your appointment.`,
      });

      onPaid?.();
      onClose?.();
    } catch (e) {
      toast({ title: 'Payment failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card rounded-t-2xl sm:rounded-2xl border border-border w-full max-w-md max-h-[88vh] overflow-hidden flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold">Checkout</h2>
            <p className="text-xs text-muted-foreground">{appointment.doctor_name} · {appointment.appointment_date} {appointment.time_slot}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">
          {/* Amount */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5 border border-primary/15">
            <div>
              <p className="text-xs text-muted-foreground">Consultation fee</p>
              <p className="text-2xl font-extrabold text-foreground">Rs {fee.toLocaleString()}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
          </div>

          {/* Method selection */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Payment method</p>
            {methods.map(m => {
              const Icon = m.icon;
              const active = method === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all active:scale-[0.99]',
                    active ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-secondary/50'
                  )}
                >
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground">{m.hint}</p>
                  </div>
                  {active && <ShieldCheck className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          {isCash && (
            <p className="text-[11px] text-muted-foreground leading-relaxed p-3 rounded-xl bg-amber-50 border border-amber-200">
              Cash payments are recorded as pending. Bring the exact amount to your appointment — the doctor will confirm receipt, which unlocks record access.
            </p>
          )}

          {/* Dummy mode banner */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200">
            <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
            <p className="text-[11px] text-blue-600 leading-relaxed">
              Demo mode: Clicking pay instantly confirms the payment. Real gateway integration coming soon.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border space-y-2 shrink-0">
          <button
            onClick={pay}
            disabled={processing || !fee}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 active:scale-95 transition-all"
          >
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : isCash ? `Confirm cash — Rs ${fee.toLocaleString()}` : `Pay Rs ${fee.toLocaleString()} Now`}
          </button>
          <p className="text-[10px] text-center text-muted-foreground">Demo checkout · payment recorded instantly to your appointment</p>
        </div>
      </div>
    </div>
  );
}