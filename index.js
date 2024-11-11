const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  let extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == 'ENOENT') {
        fs.readFile(path.join(__dirname, 'public', '404.html'), (err, content404) => {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(content404, 'utf-8');
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const wss = new WebSocket.Server({ server });

let clients = [];

wss.on('connection', (ws) => {
  const clientId = clients.length;
  let clientUsername = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "publicKey") {
        clientUsername = data.username;
        const newClient = { id: clientId, ws, publicKey: data.key, username: clientUsername };
        clients.push(newClient);

        clients.forEach(client => {
          if (client.id !== clientId && client.ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "publicKey",
              userId: client.id,
              key: client.publicKey,
              username: client.username
            }));
          }
        });

        clients.forEach(client => {
          if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: "publicKey",
              userId: clientId,
              key: data.key,
              username: clientUsername
            }));
          }
        });

        broadcastUserList();
      } else if (data.type === "message") {
        clients.forEach(client => {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: "message",
              encryptedMessage: data.encryptedMessage,
              username: clientUsername
            }));
          }
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    clients = clients.filter(client => client.ws !== ws);
    broadcastUserList();
  });
});

function broadcastUserList() {
  const userList = clients.map(client => ({
    username: client.username
  }));

  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: "userList",
        users: userList
      }));
    }
  });
}

server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
  console.log('WebSocket server is running on ws://localhost:3000');
});

