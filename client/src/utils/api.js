import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Something went wrong';
    return Promise.reject(new Error(msg));
  }
);

// ── Leads ──
export const getLeads = (params) => api.get('/leads', { params });
export const getLead = (id) => api.get(`/leads/${id}`);
export const createLead = (data) => api.post('/leads', data);
export const updateLead = (id, data) => api.patch(`/leads/${id}`, data);
export const deleteLead = (id) => api.delete(`/leads/${id}`);
export const getLeadActivities = (id) => api.get(`/leads/${id}/activities`);

// ── Pipeline ──
export const getPipeline = () => api.get('/pipeline');
export const updateStage = (id, stage) => api.patch(`/pipeline/${id}/stage`, { stage });

// ── Follow-ups ──
export const getFollowups = (params) => api.get('/followups', { params });
export const createFollowup = (data) => api.post('/followups', data);
export const completeFollowup = (id) => api.patch(`/followups/${id}/complete`);
export const snoozeFollowup = (id, hours) => api.patch(`/followups/${id}/snooze`, { hours });
export const cancelFollowup = (id) => api.delete(`/followups/${id}`);

// ── Compose ──
export const composeMessage = (data) => api.post('/compose', data);
export const getMessages = (leadId) => api.get(`/compose/messages/${leadId}`);

// ── Stats ──
export const getStats = () => api.get('/stats');

// ── Radar ──
export const getRadarQueue = (params) => api.get('/radar/queue', { params });
export const approveQueueItem = (id, reviewedBy) => api.post(`/radar/approve/${id}`, { reviewed_by: reviewedBy });
export const rejectQueueItem = (id, reviewedBy) => api.post(`/radar/reject/${id}`, { reviewed_by: reviewedBy });
export const getDiscoveryLogs = () => api.get('/radar/logs');
export const getRadarStats = () => api.get('/radar/stats');
export const triggerDiscovery = () => api.post('/radar/run-now');

export default api;
