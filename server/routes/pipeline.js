const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');

const STAGES = ['New', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won'];

// GET /api/pipeline — returns leads grouped by stage
router.get('/', async (req, res) => {
  try {
    const leads = await Lead.find({ stage: { $in: STAGES } })
      .sort({ ai_score: -1 })
      .select('_id org_name type contact_name city ai_score priority stage contract_value owner updated_at');

    const board = {};
    STAGES.forEach((s) => (board[s] = []));
    leads.forEach((l) => {
      if (board[l.stage]) board[l.stage].push(l);
    });

    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/pipeline/:id/stage — drag-and-drop stage update
router.patch('/:id/stage', async (req, res) => {
  try {
    const { stage, updated_by } = req.body;
    if (!STAGES.includes(stage) && stage !== 'Lost') {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    const old = await Lead.findById(req.params.id);
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { stage, updated_at: new Date() },
      { new: true }
    );

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    await Activity.create({
      lead_id: lead._id,
      type: 'stage_change',
      description: `Pipeline: ${old?.stage} → ${stage}`,
      created_by: updated_by || 'system',
    });

    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
