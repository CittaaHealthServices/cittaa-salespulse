# Cittaa SalesPulse v2 🚀

> Full-stack AI sales superagent for Cittaa Health Services — powered by Gemini 2.0 + Google Search, deployed on Railway.

---

## What it does

Cittaa SalesPulse is a complete CRM + AI sales engine with 6 pages and a background autonomous lead discovery system:

| Page | Description |
|------|-------------|
| **Dashboard** | Live metrics, pipeline summary, activity feed |
| **Lead Hub** | Full lead table with AI scoring, search, filters, detail drawer |
| **Pipeline** | Drag-and-drop Kanban board (New → Won) |
| **AI Composer** | Gemini-powered message generator for Email, WhatsApp, LinkedIn, Proposals |
| **Follow-up Engine** | Task list with snooze, complete, cancel + scheduling |
| **Lead Radar** | Auto-discovered leads approval queue + discovery logs |

### The superpower: Background Lead Discovery Engine
Every 6 hours, a Node.js cron job uses **Gemini 2.0 Flash + Google Search grounding** to discover real schools and corporates in Hyderabad. Each lead is scored 0–100, deduplicated, and placed in an approval queue. Sairam or Abhijay approves or rejects from the Lead Radar page — approved leads flow directly into the pipeline.

---

## Tech Stack

- **Frontend**: React 18 + Vite + React Router
- **Backend**: Node.js + Express
- **Database**: MongoDB Atlas (via Mongoose)
- **AI**: Google Gemini 2.0 Flash API (`@google/generative-ai`)
- **Scheduling**: `node-cron` (6h interval + Monday deep scan)
- **Deployment**: Railway (single service, static frontend served by Express)

---

## Local Development

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)

### 1. Clone and setup

```bash
git clone https://github.com/YOUR_ORG/cittaa-salespulse.git
cd cittaa-salespulse
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in MONGODB_URI and GEMINI_API_KEY
```

### 3. Install dependencies

```bash
# Install server deps
cd server && npm install && cd ..

# Install client deps
cd client && npm install && cd ..
```

### 4. Run development servers

**Terminal 1 — Backend:**
```bash
cd server && npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd client && npm run dev
# Runs on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) — the Vite dev server proxies `/api/*` to port 3001.

---

## Environment Variables

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `MONGODB_URI` | MongoDB Atlas connection string | Atlas → Connect → Drivers |
| `GEMINI_API_KEY` | Google AI API key | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `PORT` | Server port (default: 3001) | Set automatically by Railway |
| `FRONTEND_URL` | Frontend origin for CORS | Your Railway domain |
| `NODE_ENV` | `production` in Railway | Set in Railway variables |

---

## Project Structure

```
cittaa-salespulse/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/        # Layout, Sidebar
│   │   ├── pages/             # 6 page components
│   │   └── utils/             # API client, helpers
│   └── index.html
├── server/
│   ├── models/                # Mongoose schemas
│   ├── routes/                # Express route handlers
│   ├── jobs/
│   │   └── leadDiscovery.js   # 🤖 The AI cron engine
│   └── index.js               # Express app entry point
├── railway.json               # Railway deployment config
├── .env.example               # Environment template
└── .gitignore
```

---

## Lead Discovery Engine Details

`server/jobs/leadDiscovery.js` runs on schedule:

- **Every 6 hours** — picks 4 random queries from the bank
- **Every Monday 9am** — deep scan with all 16 queries

Each run:
1. Queries Gemini 2.0 Flash with Google Search grounding
2. Parses structured lead data from live web results
3. Deduplicates against existing leads using fuzzy matching (Levenshtein distance)
4. Scores each lead 0–100 with a second Gemini call
5. Adds to `lead_queue` collection with `status: "pending"`
6. Sairam/Abhijay review in **Lead Radar** → approve pushes to `leads` collection

---

## Deployment: Railway

See [DEPLOY.md](./DEPLOY.md) for step-by-step instructions.

---

## Brand

- **Logo font**: Kaushan Script (Google Fonts)
- **Body font**: DM Sans
- **Primary**: Purple `#8B5A96`
- **Secondary**: Teal `#7BB3A8`

---

*Built for Cittaa Health Services, Hyderabad 🇮🇳*
