import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

// Serve static files
const server = createServer((req, res) => {
    let filePath;
    const basePath = join(__dirname, '..', 'client');
    
    // Route requests to appropriate files
    if (req.url === '/' || req.url === '/index.html') {
        filePath = join(basePath, 'index.html');
    } else if (req.url === '/style.css') {
        filePath = join(basePath, 'style.css');
    } else if (req.url === '/app.js') {
        filePath = join(basePath, 'app.js');
    } else if (req.url === '/canvas.js') {
        filePath = join(basePath, 'canvas.js');
    } else {
        res.writeHead(404);
        res.end('Not found');
        return;
    }
    
    try {
        const content = readFileSync(filePath);
        const ext = filePath.split('.').pop();
        const contentType = {
            'html': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript'
        }[ext] || 'text/plain';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (error) {
        console.log('File not found:', filePath);
        res.writeHead(404);
        res.end('File not found');
    }
});

// WebSocket server for real-time collaboration
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
    
    // Send welcome message to new user
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
    
    // Notify all users about new connection
    broadcastToAll({
        type: 'user-joined',
        userId: userId,
        color: userColor,
        name: userName
    });
    
    // Handle incoming messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'draw-end':
                    // Save canvas state after drawing completes
                    if (message.userId === userId) {
                        broadcastToAll({
                            type: 'save-state',
                            userId: userId
                        });
                    }
                    break;
                    
                case 'undo':
                    // Handle undo action
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
                    // Handle redo action
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
                    // Clear canvas and history
                    currentStateIndex = -1;
                    canvasStates.length = 0;
                    broadcastToAll({
                        type: 'clear',
                        userId: userId
                    });
                    break;
                    
                case 'save-state':
                    // Save current canvas state
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
                    // Broadcast drawing actions with actual color
                    broadcastToAll({
                        ...message,
                        userId: userId
                    }, userId);
                    break;
                    
                default:
                    // Broadcast other messages with user color
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
    
    // Handle user disconnect
    ws.on('close', () => {
        console.log(`❌ User ${userId} disconnected`);
        connections.delete(userId);
        broadcastToAll({
            type: 'user-left',
            userId: userId
        });
    });
    
    // Handle WebSocket errors
    ws.on('error', (error) => {
        console.error('💥 WebSocket error for user', userId, error);
    });
});

// Broadcast message to all connected users
function broadcastToAll(message, excludeUserId = null) {
    let sentCount = 0;
    connections.forEach((user, userId) => {
        if (userId !== excludeUserId && user.ws.readyState === user.ws.OPEN) {
            user.ws.send(JSON.stringify(message));
            sentCount++;
        }
    });
}

// Generate random color for new users
function getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Clean up old canvas states to prevent memory issues
setInterval(() => {
    if (canvasStates.length > 50) {
        const statesToRemove = canvasStates.length - 50;
        canvasStates.splice(0, statesToRemove);
        currentStateIndex -= statesToRemove;
        console.log(`🧹 Cleaned up ${statesToRemove} old canvas states`);
    }
}, 60000);

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Collaborative Canvas running on port ${PORT}`);
    console.log(`🌐 WebSocket server: ws://localhost:${PORT}`);
});