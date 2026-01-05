// Simple wrapper so Vercel/other serverless platforms find a function in /api
// It forwards the incoming (req, res) to the Express app exported by backend/index.js

const app = require('../index'); // backend/index.js exports the Express app

module.exports = (req, res) => {
  // The Express app is a function (req, res) so call it directly.
  // If you need additional adaptation (e.g. for AWS Lambda), use serverless-http.
  return app(req, res);
};
