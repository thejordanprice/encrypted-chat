const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const server = http.createServer(handleHttpRequest);
const wss = new WebSocket.Server({ server });

let clients = [];

function handleHttpRequest(req, res) {
  const filePath = getFilePath(req.url);
  const contentType = getContentType(filePath);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      handleFileReadError(res, error);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

function getFilePath(url) {
  return path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
}

function getContentType(filePath) {
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css'
  };
  return mimeTypes[extname] || 'application/octet-stream';
}

function handleFileReadError(res, error) {
  if (error.code === 'ENOENT') {
    fs.readFile(path.join(__dirname, 'public', '404.html'), (err, content404) => {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(content404, 'utf-8');
    });
  } else {
    res.writeHead(500);
    res.end(`Server Error: ${error.code}`);
  }
}

wss.on('connection', handleWebSocketConnection);

function handleWebSocketConnection(ws) {
  const clientId = clients.length;
  let clientUsername = null;

  ws.on('message', (message) => handleClientMessage(ws, message, clientId, (username) => {
    clientUsername = username;
  }));

  ws.on('close', () => handleClientDisconnection(ws));
}

function handleClientMessage(ws, message, clientId, setClientUsername) {
  try {
    const data = JSON.parse(message);

    if (data.type === "publicKey") {
      handlePublicKey(ws, data, clientId, setClientUsername);
    } else if (data.type === "message") {
      broadcastMessage(data.encryptedMessage, ws, clientId);
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

function handlePublicKey(ws, data, clientId, setClientUsername) {
  const { username, key } = data;
  setClientUsername(username);

  clients.push({ id: clientId, ws, publicKey: key, username });

  sendExistingClientsPublicKeys(ws, clientId);
  notifyOthersOfNewClient(ws, data, clientId);
  broadcastUserList();
}

function sendExistingClientsPublicKeys(ws, clientId) {
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
}

function notifyOthersOfNewClient(ws, data, clientId) {
  clients.forEach(client => {
    if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: "publicKey",
        userId: clientId,
        key: data.key,
        username: data.username
      }));
    }
  });
}

function broadcastMessage(encryptedMessage, ws, clientId) {
  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: "message",
        encryptedMessage,
        username: clients[clientId].username
      }));
    }
  });
}

function handleClientDisconnection(ws) {
  clients = clients.filter(client => client.ws !== ws);
  broadcastUserList();
}

function broadcastUserList() {
  const userList = clients.map(client => ({ username: client.username }));

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
