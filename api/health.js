// Vercel serverless: GET /api/health → Express app
const app = require('../server.js');
module.exports = (req, res) => app(req, res);
