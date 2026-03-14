import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LeadHub from './pages/LeadHub';
import Pipeline from './pages/Pipeline';
import AIComposer from './pages/AIComposer';
import FollowupEngine from './pages/FollowupEngine';
import LeadRadar from './pages/LeadRadar';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem', borderRadius: 10 },
          success: { iconTheme: { primary: '#7BB3A8', secondary: 'white' } },
          error: { iconTheme: { primary: '#e84c4c', secondary: 'white' } },
        }}
      />
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/leads" element={<LeadHub />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/compose" element={<AIComposer />} />
          <Route path="/followups" element={<FollowupEngine />} />
          <Route path="/radar" element={<LeadRadar />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
