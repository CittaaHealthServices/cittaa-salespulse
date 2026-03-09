# Cittaa SalesPulse — Deployment Guide

Step-by-step guide to deploy on Railway with MongoDB Atlas.

---

## Step 1: MongoDB Atlas Setup

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) and sign in (free tier is fine)
2. Create a new **cluster** (M0 Free tier)
3. Under **Database Access** → Add a new database user with `readWriteAnyDatabase` role. Note the username + password.
4. Under **Network Access** → Add IP `0.0.0.0/0` (allow access from anywhere — Railway IPs are dynamic)
5. Click **Connect** → **Connect your application** → Driver: Node.js
6. Copy the connection string — it looks like:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/
   ```
7. Keep this — you'll need it in Railway.

---

## Step 2: GitHub Repository

1. Create a new repo on [github.com](https://github.com) — e.g. `cittaa-salespulse`
2. In the project folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — Cittaa SalesPulse v2"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/cittaa-salespulse.git
   git push -u origin main
   ```

---

## Step 3: Gemini API Key

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **Create API Key**
3. Copy the key (starts with `AIza...`)

---

## Step 4: Railway Deployment

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `cittaa-salespulse` repo
4. Railway will auto-detect `railway.json` and start the build

### Set Environment Variables in Railway

Go to your service → **Variables** tab → Add these:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Your Atlas connection string |
| `GEMINI_API_KEY` | Your Gemini API key |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://YOUR-RAILWAY-DOMAIN.up.railway.app` |

> After setting `FRONTEND_URL`, redeploy once to pick up the CORS setting.

### Generate a public domain

In Railway → your service → **Settings** → **Networking** → **Generate Domain**

Your app will be live at `https://something.up.railway.app`

---

## Step 5: Verify Deployment

Hit your Railway URL + `/api/health` — you should see:
```json
{
  "status": "ok",
  "app": "Cittaa SalesPulse",
  "version": "2.0.0",
  "db": "connected"
}
```

---

## Step 6: Seed First Lead (Optional)

To confirm the system works, add a test lead manually from the Lead Hub page, then run a discovery from the Lead Radar page.

---

## Cron Job Verification

After deployment, the background discovery runs automatically. To check:
1. Go to **Lead Radar** → **Run Discovery Now** → wait 2 minutes
2. Check the **Discovery Run History** table at the bottom
3. If status is `success` — you're fully live 🎉

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `MongoDB connection failed` | Check MONGODB_URI format and Atlas IP whitelist |
| `Gemini API error` | Verify GEMINI_API_KEY is correct and has quota |
| Build fails | Check Railway build logs — usually a missing `npm install` |
| CORS errors in browser | Set `FRONTEND_URL` in Railway vars to your Railway domain |
| Discovery returns no leads | Gemini grounding requires quota — check AI Studio usage |

---

## Local → Production Workflow

```bash
# After making changes:
git add .
git commit -m "feat: your change"
git push origin main
# Railway auto-deploys on push to main
```

---

*Deploy questions? The Railway docs at [docs.railway.app](https://docs.railway.app) are excellent.*
