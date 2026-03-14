import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout          from './components/Layout';
import Dashboard       from './pages/Dashboard';
import LeadRadar       from './pages/LeadRadar';
import LeadHub         from './pages/LeadHub';
import Pipeline        from './pages/Pipeline';
import AIComposer      from './pages/AIComposer';
import FollowupEngine  from './pages/FollowupEngine';
import SystemHealth    from './pages/SystemHealth';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/radar"         element={<LeadRadar />} />
          <Route path="/hub"           element={<LeadHub />} />
          <Route path="/pipeline"      element={<Pipeline />} />
          <Route path="/compose"       element={<AIComposer />} />
          <Route path="/followups"     element={<FollowupEngine />} />
          <Route path="/system-health" element={<SystemHealth />} />
        </Routes>
      </Layout>
    </Router>
  );
}
