# Deploy Gemini RAG UI on Vercel (Step-by-Step)

This guide walks you through deploying the Gemini File Search Manager dashboard on [Vercel](https://vercel.com) so it’s available on the web.

---

## Prerequisites

- **Node.js** (v18 or newer) — [nodejs.org](https://nodejs.org)
- **Git** — [git-scm.com](https://git-scm.com)
- **Vercel account** — free at [vercel.com/signup](https://vercel.com/signup)
- Your project in a **Git repository** (GitHub, GitLab, or Bitbucket)

---

## Step 1: Push Your Project to GitHub

1. Open a terminal in the project folder:
   ```bash
   cd c:\Users\ricki\Downloads\gemini_RAG_UI
   ```
2. If the folder is not yet a Git repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
3. Create a new repository on [GitHub](https://github.com/new) (e.g. `gemini-rag-ui`).
4. Add the remote and push (replace `YOUR_USERNAME` and `YOUR_REPO` with your values):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Sign In to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (or create an account).
2. Choose **Continue with GitHub** (or GitLab/Bitbucket) so Vercel can access your repos.

---

## Step 3: Import the Project

1. On the Vercel dashboard, click **Add New…** → **Project**.
2. **Import** the repository you pushed in Step 1 (e.g. `gemini-rag-ui`).
3. Vercel will detect the project. Leave the defaults:
   - **Framework Preset:** Other
   - **Root Directory:** `./`
   - **Build Command:** leave empty (no build step)
   - **Output Directory:** leave empty (static files at root)
4. Click **Deploy**.

---

## Step 4: Wait for the First Deploy

- Vercel will build and deploy. This usually takes under a minute.
- When it’s done, you’ll get a URL like `https://your-project-xxx.vercel.app`.
- Open that URL: you should see the dashboard (Hebrew UI, file management, etc.).

---

## Step 5: Environment Variables (Optional — for file uploads)

The app’s **upload** feature works by proxying to a **Python upload service**. On Vercel you only deploy the **Node + static** part; the Python service must run somewhere else.

- **If you don’t set anything:**  
  The site and list/delete of documents work (they call Google’s API from the browser). **Upload** will show “Upload service unavailable” because there is no Python backend.

- **If you want uploads to work:**  
  Deploy the Python upload service (e.g. on [Railway](https://railway.app), [Render](https://render.com), or another host) and then tell Vercel where it is:

1. In Vercel: open your project → **Settings** → **Environment Variables**.
2. Add:
   - **Name:** `PYTHON_UPLOAD_URL`  
   - **Value:** `https://your-python-upload-service.com` (the full URL where your Python app runs, no trailing slash)  
   - **Environment:** Production (and Preview if you want).
3. Save and **redeploy** the project (Deployments → ⋮ on latest → Redeploy).

After redeploy, the “Upload document” flow will use your Python service.

---

## Step 6: Custom Domain (Optional)

1. In the project on Vercel, go to **Settings** → **Domains**.
2. Add your domain (e.g. `app.yourdomain.com`).
3. Follow Vercel’s instructions to add the DNS records (CNAME or A) at your registrar.
4. After DNS propagates, Vercel will issue SSL and your app will be available at your domain.

---

## Deploying from the CLI (Alternative)

If you prefer the command line:

1. Install the Vercel CLI:
   ```bash
   npm i -g vercel
   ```
2. In the project folder:
   ```bash
   cd c:\Users\ricki\Downloads\gemini_RAG_UI
   vercel
   ```
3. Log in when asked and follow the prompts (link to existing project or create new one).
4. To add env vars from the CLI:
   ```bash
   vercel env add PYTHON_UPLOAD_URL
   ```
   Enter the Python service URL when prompted, then redeploy:
   ```bash
   vercel --prod
   ```

---

## Summary

| Step | Action |
|------|--------|
| 1 | Push project to GitHub (or GitLab/Bitbucket) |
| 2 | Sign in to Vercel (e.g. with GitHub) |
| 3 | Import the repo as a new project and Deploy |
| 4 | Use the generated `*.vercel.app` URL to open the app |
| 5 | (Optional) Set `PYTHON_UPLOAD_URL` and redeploy for uploads |
| 6 | (Optional) Add a custom domain in Settings → Domains |

After this, your Gemini RAG UI is deployed on the web. The dashboard and store/document listing work immediately; uploads work once the Python upload service is deployed and `PYTHON_UPLOAD_URL` is set.
