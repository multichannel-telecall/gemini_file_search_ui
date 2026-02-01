// Vercel serverless: POST /api/upload-document → Express app
const app = require('../server.js');
module.exports = (req, res) => app(req, res);
