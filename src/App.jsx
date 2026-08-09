import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { isAdmin, isDoctor } from '@/lib/useRole';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Home from '@/pages/Home';
import FindDoctors from '@/pages/FindDoctors';
import Appointments from '@/pages/Appointments';
import MedicalRecords from '@/pages/MedicalRecords';
import RecordTimelinePage from '@/pages/RecordTimelinePage';
import ImportRecord from '@/pages/ImportRecord';
import Prescriptions from '@/pages/Prescriptions';
import Medications from '@/pages/Medications';
import Emergency from '@/pages/Emergency';
import ConsultationHistory from '@/pages/ConsultationHistory';
import DoctorDashboard from '@/pages/DoctorDashboard';
import DoctorAppointments from '@/pages/DoctorAppointments';
import DoctorPatients from '@/pages/DoctorPatients';
import DoctorPrescriptions from '@/pages/DoctorPrescriptions';
import DoctorSchedule from '@/pages/DoctorSchedule';
import DoctorCalendar from '@/pages/DoctorCalendar';
import DoctorEncounters from '@/pages/DoctorEncounters';
import DoctorVerification from '@/pages/DoctorVerification';
import Onboarding from '@/pages/Onboarding';
import EditProfile from '@/pages/EditProfile';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Chat from '@/pages/Chat';
import ChatThread from '@/pages/ChatThread';
import DoctorProfile from '@/pages/DoctorProfile';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminDoctors from '@/pages/AdminDoctors';
import AdminUsers from '@/pages/AdminUsers';
import ManageAccess from '@/pages/ManageAccess';
import HealthCards from '@/pages/HealthCards';
import Household from '@/pages/Household';
import VerifyCard from '@/pages/VerifyCard';
import AdminAuditLog from '@/pages/AdminAuditLog';
import AdminCountryConfig from '@/pages/AdminCountryConfig';
import AdminPixels from '@/pages/AdminPixels';
import AdminApiKeys from '@/pages/AdminApiKeys';
import AdminEmailConfig from '@/pages/AdminEmailConfig';
import PixelTracker from '@/components/PixelTracker';
import NotificationsPage from '@/pages/NotificationsPage';
import ProtectedRoute from '@/components/ProtectedRoute';
import ErrorBoundary from '@/components/ErrorBoundary';

// Redirects admin/doctor users away from the patient Home page to their portal
const RoleRedirect = ({ children }) => {
  const { user } = useAuth();
  if (user && isAdmin(user.role)) return <Navigate to="/admin" replace />;
  if (user && isDoctor(user.role, user.app_role)) return <Navigate to="/doctor" replace />;
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // Render the main app
  return (
    <Routes>
      {/* Auth Routes — accessible without authentication */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Onboarding — requires auth, skips onboarding check */}
      <Route element={<ProtectedRoute skipOnboarding unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>

      {/* Patient Portal — any authenticated, onboarded user */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/" element={<RoleRedirect><Home /></RoleRedirect>} />
        <Route path="/doctors" element={<FindDoctors />} />
        <Route path="/doctors/:id" element={<DoctorProfile />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/records" element={<MedicalRecords />} />
        <Route path="/timeline" element={<RecordTimelinePage />} />
        <Route path="/records/import" element={<ImportRecord />} />
        <Route path="/prescriptions" element={<Prescriptions />} />
        <Route path="/medications" element={<Medications />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/history" element={<ConsultationHistory />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:conversationId" element={<ChatThread />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/access" element={<ManageAccess />} />
        <Route path="/cards" element={<HealthCards />} />
        <Route path="/household" element={<Household />} />
        <Route path="/profile" element={<EditProfile />} />
      </Route>

      {/* Doctor Portal — requires doctor role */}
      <Route element={<ProtectedRoute requiredRole="doctor" unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/doctor" element={<DoctorDashboard />} />
        <Route path="/doctor/appointments" element={<DoctorAppointments />} />
        <Route path="/doctor/patients" element={<DoctorPatients />} />
        <Route path="/doctor/prescriptions" element={<DoctorPrescriptions />} />
        <Route path="/doctor/encounters" element={<DoctorEncounters />} />
        <Route path="/doctor/schedule" element={<DoctorSchedule />} />
        <Route path="/doctor/calendar" element={<DoctorCalendar />} />
        <Route path="/doctor/verification" element={<DoctorVerification />} />
        <Route path="/doctor/verify-card" element={<VerifyCard />} />
      </Route>

      {/* Admin Portal — requires admin role */}
      <Route element={<ProtectedRoute requiredRole="admin" unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/doctors" element={<AdminDoctors />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/audit" element={<AdminAuditLog />} />
        <Route path="/admin/config" element={<AdminCountryConfig />} />
        <Route path="/admin/pixels" element={<AdminPixels />} />
        <Route path="/admin/api-keys" element={<AdminApiKeys />} />
        <Route path="/admin/email" element={<AdminEmailConfig />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ErrorBoundary>
            <ScrollToTop />
            <PixelTracker />
            <AuthenticatedApp />
          </ErrorBoundary>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App