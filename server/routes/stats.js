const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Followup = require('../models/Followup');
const Activity = require('../models/Activity');
const LeadQueue = require('../models/LeadQueue');

// GET /api/stats
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalLeads,
      newLeads,
      contacted,
      proposalSent,
      negotiation,
      won,
      lost,
      totalPipelineValue,
      wonValue,
      schoolLeads,
      corpLeads,
      highPriority,
      pendingFollowups,
      overdueFollowups,
      todayFollowups,
      pendingQueue,
      recentActivities,
    ] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ stage: 'New' }),
      Lead.countDocuments({ stage: 'Contacted' }),
      Lead.countDocuments({ stage: 'Proposal Sent' }),
      Lead.countDocuments({ stage: 'Negotiation' }),
      Lead.countDocuments({ stage: 'Won' }),
      Lead.countDocuments({ stage: 'Lost' }),
      Lead.aggregate([
        { $match: { stage: { $nin: ['Lost'] } } },
        { $group: { _id: null, total: { $sum: '$contract_value' } } },
      ]),
      Lead.aggregate([
        { $match: { stage: 'Won' } },
        { $group: { _id: null, total: { $sum: '$contract_value' } } },
      ]),
      Lead.countDocuments({ type: 'school' }),
      Lead.countDocuments({ type: 'corporate' }),
      Lead.countDocuments({ priority: 'high' }),
      Followup.countDocuments({ status: 'pending' }),
      Followup.countDocuments({ status: 'pending', due_date: { $lt: new Date() } }),
      Followup.countDocuments({
        status: 'pending',
        due_date: { $gte: new Date(Date.now()).setHours(0, 0, 0, 0), $lt: new Date(Date.now()).setHours(23, 59, 59, 999) },
      }),
      LeadQueue.countDocuments({ status: 'pending' }),
      Activity.find().sort({ created_at: -1 }).limit(10).populate('lead_id', 'org_name type'),
    ]);

    res.json({
      leads: {
        total: totalLeads,
        by_stage: { New: newLeads, Contacted: contacted, 'Proposal Sent': proposalSent, Negotiation: negotiation, Won: won, Lost: lost },
        by_type: { school: schoolLeads, corporate: corpLeads },
        high_priority: highPriority,
      },
      pipeline: {
        total_value: totalPipelineValue[0]?.total || 0,
        won_value: wonValue[0]?.total || 0,
        win_rate: totalLeads > 0 ? Math.round((won / (won + lost || 1)) * 100) : 0,
      },
      followups: {
        pending: pendingFollowups,
        overdue: overdueFollowups,
        today: todayFollowups,
      },
      radar: {
        pending_queue: pendingQueue,
      },
      recent_activities: recentActivities,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
