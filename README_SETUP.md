# Setup Instructions

## Quick Start

1. **Install Node dependencies:**
   ```bash
   npm install
   ```

2. **Install Python dependencies (for uploads):**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the Python upload service** (Terminal 1):
   ```bash
   python upload_service.py
   ```
   Runs on `http://localhost:5000` by default.

4. **Start the main server** (Terminal 2):
   ```bash
   npm start
   ```
   or `npm run dev`

5. **Access the application:**
   Open your browser to `http://localhost:3001`

## How It Works

- **Node server (`server.js`):** Serves the UI and proxies upload requests to the Python service.
- **Python upload service (`upload_service.py`):** Uses the Google GenAI SDK to upload files to File Search stores. The SDK handles both upload and indexing in one `upload_to_file_search_store` operation, then polls until processing is complete.

**Proxy support:** Set `HTTPS_PROXY` and optionally `SSL_CERT_FILE` before running if you're behind a corporate proxy.

## Port Configuration

The server runs on port **3001** by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Requirements

- Node.js 18+
- Python 3.8+
- npm or yarn

## Troubleshooting

### Server won't start
- Make sure Node.js is installed: `node --version`
- Install dependencies: `npm install`
- Check if port 3001 is already in use

### Uploads still fail
- **Start the Python upload service:** `python upload_service.py` (must run on port 5000)
- Make sure you're accessing the app through the server URL (`http://localhost:3001`)
- Don't open `index.html` directly in the browser
- Check both Node and Python console for error messages
- Verify your API key is correct
- For proxy environments: set `HTTPS_PROXY` and `SSL_CERT_FILE` before starting Python

### CORS errors
- If you see CORS errors, make sure you're using the proxy server
- The proxy server should be running on the same origin as your frontend
