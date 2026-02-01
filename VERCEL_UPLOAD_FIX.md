# Fix: Upload 503 on Vercel (Node proxy instead of Python)

If you see **503** and logs like "Upload request received (proxying to Python service)" and "ECONNREFUSED 127.0.0.1:5000" on your **deployed** Vercel app, the deployment is still using the **Node proxy** (server.js) instead of the **Python serverless function** (api/upload-document.py).

## Cause

The repo or the deployment still has a **Node** handler for `/api/upload-document` (e.g. an old `api/upload-document.js`). That handler runs server.js and tries to proxy to `localhost:5000`, which does not exist on Vercel → 503.

## Fix

1. **Remove any Node handler for upload**  
   On GitHub, open your repo and check:
   - There must be **no** file `api/upload-document.js`.
   - There must be a file `api/upload-document.py`.

   If `api/upload-document.js` exists on GitHub, delete it and commit:
   ```bash
   git rm api/upload-document.js
   git commit -m "Use Python serverless for upload on Vercel"
   git push origin main
   ```

2. **Redeploy on Vercel**  
   - Open your project on [Vercel](https://vercel.com) → **Deployments**.
   - Click the **⋮** on the latest deployment → **Redeploy**.
   - Or push a small change to trigger a new deployment.

3. **Use the new deployment**  
   Open the **new** deployment URL (or Production) and try uploading again. The Python function should run and you should **not** see "proxying to Python service" in the logs.

## Check

After redeploying, in Vercel **Functions** or **Logs**, when you upload a file you should see the **Python** function `api/upload-document.py` running, not the Node proxy.
