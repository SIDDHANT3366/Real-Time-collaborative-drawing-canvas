import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

// Serve static files
const server = createServer((req, res) => {
    const basePath = join(__dirname, '../client');
    let filePath = req.url === '/' ? 
        join(basePath, 'index.html') : 
        join(basePath, req.url);
    
    // Security: Prevent directory traversal
    filePath = join(basePath, req.url.replace(/\.\./g, ''));
    
    try {
        const content = readFileSync(filePath);
        const ext = filePath.split('.').pop();
        const contentType = {
            'html': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript',
            'ico': 'image/x-icon',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'svg': 'image/svg+xml'
        }[ext] || 'text/plain';
        
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600'
        });
        res.end(content);
    } catch (error) {
        console.log('File not found:', filePath);
        res.writeHead(404);
        res.end('File not found');
    }
});

// WebSocket server
const wss = new WebSocketServer({ server });
const connections = new Map();
const canvasStates = [];
let currentStateIndex = -1;

console.log('🚀 Collaborative Canvas Server starting...');

wss.on('connection', (ws) => {
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const userColor = getRandomColor();
    const userName = `User ${connections.size + 1}`;
    
    console.log(`✅ User ${userId} connected`);
    
    connections.set(userId, { 
        ws, 
        color: userColor, 
        name: userName,
        userId: userId
    });
    
    // Send welcome
    ws.send(JSON.stringify({
        type: 'welcome',
        userId: userId,
        color: userColor,
        name: 'You'
    }));
    
    // Send current user list
    const currentUsers = Array.from(connections.values()).map(user => ({
        id: user.userId,
        color: user.color,
        name: user.name
    }));
    
    ws.send(JSON.stringify({
        type: 'user-list',
        data: currentUsers
    }));
    
    // Send current canvas state to new user
    if (currentStateIndex >= 0) {
        ws.send(JSON.stringify({
            type: 'canvas-state',
            stateIndex: currentStateIndex,
            stateData: canvasStates[currentStateIndex]
        }));
    }
    
    // Notify about new user
    broadcastToAll({
        type: 'user-joined',
        userId: userId,
        color: userColor,
        name: userName
    });
    
    // Handle messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'draw-end':
                    if (message.userId === userId) {
                        broadcastToAll({
                            type: 'save-state',
                            userId: userId
                        });
                    }
                    break;
                    
                case 'undo':
                    if (currentStateIndex > 0) {
                        currentStateIndex--;
                        broadcastToAll({
                            type: 'undo',
                            stateIndex: currentStateIndex,
                            stateData: canvasStates[currentStateIndex]
                        });
                    } else if (currentStateIndex === 0) {
                        currentStateIndex = -1;
                        broadcastToAll({
                            type: 'undo',
                            stateIndex: -1,
                            stateData: null
                        });
                    }
                    break;
                    
                case 'redo':
                    if (currentStateIndex < canvasStates.length - 1) {
                        currentStateIndex++;
                        broadcastToAll({
                            type: 'redo',
                            stateIndex: currentStateIndex,
                            stateData: canvasStates[currentStateIndex]
                        });
                    }
                    break;
                    
                case 'clear':
                    currentStateIndex = -1;
                    canvasStates.length = 0;
                    broadcastToAll({
                        type: 'clear',
                        userId: userId
                    });
                    break;
                    
                case 'save-state':
                    if (message.stateData) {
                        if (currentStateIndex < canvasStates.length - 1) {
                            canvasStates.splice(currentStateIndex + 1);
                        }
                        currentStateIndex++;
                        canvasStates[currentStateIndex] = message.stateData;
                    }
                    break;
                    
                case 'draw-start':
                case 'draw-move':
                    broadcastToAll({
                        ...message,
                        userId: userId
                    }, userId);
                    break;
                    
                default:
                    broadcastToAll({
                        ...message,
                        userId: userId,
                        color: userColor
                    }, userId);
            }
            
        } catch (error) {
            console.error('❌ Error parsing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log(`❌ User ${userId} disconnected`);
        connections.delete(userId);
        broadcastToAll({
            type: 'user-left',
            userId: userId
        });
    });
    
    ws.on('error', (error) => {
        console.error('💥 WebSocket error for user', userId, error);
    });
});

function broadcastToAll(message, excludeUserId = null) {
    let sentCount = 0;
    connections.forEach((user, userId) => {
        if (userId !== excludeUserId && user.ws.readyState === user.ws.OPEN) {
            user.ws.send(JSON.stringify(message));
            sentCount++;
        }
    });
}

function getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Clean up old canvas states
setInterval(() => {
    if (canvasStates.length > 50) {
        const statesToRemove = canvasStates.length - 50;
        canvasStates.splice(0, statesToRemove);
        currentStateIndex -= statesToRemove;
    }
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Collaborative Canvas running on port ${PORT}`);
    console.log(`🌐 WebSocket server: ws://localhost:${PORT}`);
});