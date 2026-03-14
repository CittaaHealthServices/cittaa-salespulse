import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from 'date-fns';

export const formatCurrency = (val) => {
  if (!val || val === 0) return '—';
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val}`;
};

export const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'dd MMM yyyy');
};

export const formatRelative = (date) => {
  if (!date) return '—';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

export const isOverdue = (date) => date && isPast(new Date(date));

export const scoreClass = (score) => {
  if (score >= 70) return 'score-high';
  if (score >= 40) return 'score-mid';
  return 'score-low';
};

export const stageBadgeClass = (stage) => {
  const map = {
    New: 'badge-new', Contacted: 'badge-contacted', 'Proposal Sent': 'badge-proposal',
    Negotiation: 'badge-negotiation', Won: 'badge-won', Lost: 'badge-lost',
  };
  return map[stage] || 'badge-new';
};

export const priorityClass = (p) => ({ high: 'badge-high', medium: 'badge-medium', low: 'badge-low' }[p] || 'badge-medium');

export const ownerName = (o) => (o === 'S' ? 'Sairam' : 'Abhijay');

export const channelIcon = (ch) => {
  const map = { Email: '✉️', WhatsApp: '💬', LinkedIn: '🔗', Call: '📞', Visit: '🚗', Proposal: '📄' };
  return map[ch] || '📌';
};
