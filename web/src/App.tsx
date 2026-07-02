import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import Users from "./pages/Users";
import Profiles from "./pages/Profiles";
import Roles from "./pages/Roles";
import SignatureGroups from "./pages/SignatureGroups";
import Stamps from "./pages/Stamps";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Audit from "./pages/Audit";
import ApprovalTypes from "./pages/ApprovalTypes";
import Legal from "./pages/Legal";
import Account from "./pages/Account";
import ErrorLog from "./pages/ErrorLog";
import Updates from "./pages/Updates";

export default function App() {
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!me) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );

  // Dashboard is accessible to all users (personal stats), admins see system overview too.
  const home = <Dashboard />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={home} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/:id" element={<DocumentDetail />} />
        <Route path="/users" element={<Users />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/roles" element={<Roles />} />
        <Route path="/signature-groups" element={<SignatureGroups />} />
        <Route path="/stamps" element={<Stamps />} />
        <Route path="/approval-types" element={<ApprovalTypes />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/account" element={<Account />} />
        <Route path="/error-log" element={<ErrorLog />} />
        <Route path="/updates" element={<Updates />} />
        <Route path="/legal/terms" element={<Legal docKey="terms" />} />
        <Route path="/legal/privacy" element={<Legal docKey="privacy" />} />
        <Route path="/legal/about" element={<Legal docKey="about" />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
