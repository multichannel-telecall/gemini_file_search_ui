const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;
const PYTHON_UPLOAD_URL = process.env.PYTHON_UPLOAD_URL || 'http://localhost:5000';

// Enable CORS for all routes
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Configure multer for file uploads (store in memory - no disk storage needed)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

// Proxy endpoint: forwards file uploads to Python upload service (uses Google GenAI SDK)
app.post('/api/upload-document', upload.single('file'), async (req, res) => {
    console.log('📤 Upload request received (proxying to Python service)');
    console.log('  - Has file:', !!req.file);
    console.log('  - File name:', req.file?.originalname);

    try {
        const { storeName, apiKey, displayName } = req.body;

        if (!storeName || !apiKey || !req.file) {
            return res.status(400).json({
                error: 'Missing required parameters: storeName, apiKey, and file are required'
            });
        }

        // Forward to Python upload service (handles upload + indexing via genai SDK)
        const form = new FormData();
        form.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype || 'application/octet-stream'
        });
        form.append('storeName', storeName);
        form.append('apiKey', apiKey);
        if (displayName) form.append('displayName', displayName);

        const response = await axios.post(`${PYTHON_UPLOAD_URL}/api/upload-document`, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: () => true // Accept any status so we can forward it
        });

        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('❌ Upload proxy error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                error: 'שירות ההעלאה לא פועל. מקומית: הרץ python upload_service.py או הגדר PYTHON_UPLOAD_URL לכתובת האפליקציה ב-Vercel.'
            });
        }
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});


// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Proxy server is running' });
});

// Serve static files (HTML, CSS, JS) - AFTER API routes
app.use(express.static(__dirname));

// Serve the main HTML file for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// On Vercel, the app is used as serverless functions (api/upload-document.js, api/health.js)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running on http://localhost:${PORT}`);
        console.log(`📁 Serving files from: ${__dirname}`);
        console.log(`\n📋 Endpoints:`);
        console.log(`   POST /api/upload-document - Proxy to Python (upload + index)`);
        console.log(`   GET  /api/health - Health check`);
        console.log(`\n⚠️  Start Python upload service: python upload_service.py`);
        console.log(`   (or set PYTHON_UPLOAD_URL if running elsewhere)\n`);
    });
}

module.exports = app;
