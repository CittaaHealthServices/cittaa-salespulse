const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Message = require('../models/Message');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPTS = {
  school_email: `You are an expert sales copywriter for Cittaa Health Services — a mental health technology company based in Hyderabad, India. You write warm, professional emails to school principals and administrators.

Cittaa offers:
- AI-powered mental health assessment platform for students
- Certified school counsellor support
- Real-time student wellbeing dashboards for school management
- NEP 2020 and CBSE wellness policy compliant
- Trusted by schools across Telangana

Your email must:
- Open with a personalised, relevant hook (reference a challenge schools face — exam stress, student anxiety, NEP compliance)
- Clearly explain ONE core benefit of Cittaa for the school
- Include a specific, low-pressure CTA (e.g., "a 20-minute demo call this week")
- Be warm but professional — write like a human, not a robot
- Length: 150-200 words max
- Subject line: include a compelling subject line first, then the email body`,

  school_whatsapp: `You are writing a WhatsApp message for Cittaa Health Services to a school principal or HOD.

Cittaa helps schools with student mental health — AI assessments, counsellor support, NEP compliance.

Rules for WhatsApp:
- Max 3 short paragraphs
- Conversational, friendly tone — like a warm intro
- Use line breaks generously (mobile reading)
- One clear ask at the end (e.g., "Would a quick 15-min call work this week?")
- NO formal greetings like "Dear Sir/Madam" — use first name if available
- Total length: 80-100 words`,

  school_linkedin: `You are writing a LinkedIn connection request message for Cittaa Health Services targeting school principals, HODs, and administrators.

Rules:
- Character limit: 300 chars max (strict)
- Mention one specific, relevant thing about the school or their role
- Reference Cittaa's value prop in one line
- End with a soft CTA
- Professional but conversational tone`,

  corporate_email: `You are an expert B2B sales copywriter for Cittaa Health Services targeting HR Heads, CHROs, and Wellness Managers at Indian companies.

Cittaa offers:
- AI-powered employee mental health assessments
- Anonymous mental health check-ins
- Manager dashboards and early intervention tools
- EAP (Employee Assistance Program) services
- ROI: reduced absenteeism, improved productivity

Your email must:
- Open with a business-relevant hook (e.g., burnout costs, attrition, Zomato/Flipkart culture references)
- Connect Cittaa's value to their business outcomes
- Be data-driven where possible
- Include a low-friction CTA
- Length: 150-200 words
- Start with a compelling subject line`,

  corporate_whatsapp: `Write a WhatsApp message from Cittaa Health Services to an HR Head or CHRO.

Cittaa helps companies improve employee mental health — assessments, anonymous check-ins, manager dashboards.

Rules:
- Conversational, peer-to-peer tone
- 3 short paragraphs max
- Mention ONE relevant business problem (burnout, attrition, productivity)
- End with a soft ask
- 80-100 words total`,

  proposal: `You are writing a professional business proposal introduction for Cittaa Health Services.

Cittaa Health Services offers a full-stack mental health platform for schools and corporates in India, combining AI assessments, certified counsellors, and real-time analytics.

Write a 3-paragraph proposal introduction that:
- Para 1: Acknowledge the specific challenge the organisation faces
- Para 2: Explain how Cittaa's solution addresses it specifically
- Para 3: Propose next steps (pilot program, demo, POC)

Tone: confident, professional, solution-focused
Length: 200-250 words`,
};

// POST /api/compose
router.post('/', async (req, res) => {
  try {
    const { lead_id, channel, lead_type, org_name, contact_name, city, role, tone, custom_context, created_by } = req.body;

    if (!channel || !org_name) {
      return res.status(400).json({ error: 'channel and org_name are required' });
    }

    const promptKey = `${lead_type || 'corporate'}_${channel.toLowerCase()}`;
    const systemPrompt = SYSTEM_PROMPTS[promptKey] || SYSTEM_PROMPTS['corporate_email'];

    const userPrompt = `
Organisation: ${org_name}
${contact_name ? `Contact: ${contact_name} (${role || 'HR'})` : ''}
${city ? `Location: ${city}` : ''}
${tone ? `Tone preference: ${tone}` : ''}
${custom_context ? `Additional context: ${custom_context}` : ''}

Write the message now.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent([systemPrompt, userPrompt].join('\n\n'));
    const content = result.response.text();

    // Save to DB if lead_id provided
    if (lead_id) {
      await Message.create({
        lead_id,
        channel,
        content,
        ai_generated: true,
        created_by: created_by || 'S',
      });
    }

    res.json({ content, channel, org_name });
  } catch (err) {
    console.error('Compose error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compose/messages/:lead_id
router.get('/messages/:lead_id', async (req, res) => {
  try {
    const messages = await Message.find({ lead_id: req.params.lead_id }).sort({ created_at: -1 }).limit(20);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
