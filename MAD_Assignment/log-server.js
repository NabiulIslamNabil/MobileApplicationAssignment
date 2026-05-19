const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 3001;
const LOG_PATH = path.join(__dirname, 'log.txt');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && req.url === '/log-task') {
    const content = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : 'No log entries yet.';
    sendJson(res, 200, { content, path: LOG_PATH });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/log-task') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });

  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      if (typeof data.line !== 'string' || !data.line.trim()) {
        sendJson(res, 400, { error: 'Missing log line' });
        return;
      }

      fs.appendFileSync(LOG_PATH, data.line, 'utf8');
      sendJson(res, 200, { ok: true, path: LOG_PATH });
      console.log(`[ROOT LOG APPENDED] ${data.line.trim()}`);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Task log server running at http://localhost:${PORT}`);
  console.log(`Writing task logs to ${LOG_PATH}`);
});
