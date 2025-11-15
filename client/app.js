class CollaborativeApp {
    constructor() {
        console.log('🎨 CollaborativeApp starting...');
        
        this.canvas = new DrawingCanvas('drawing-canvas');
        this.ws = null;
        this.userId = null;
        this.userColor = null;
        this.users = new Map();
        this.isDrawing = false;
        
        this.setupWebSocket();
        this.setupUI();
        this.setupEventListeners();
        
        console.log('🎨 CollaborativeApp started successfully');
    }

    setupWebSocket() {
        // Auto-detect WebSocket URL for production
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('🔗 Connecting to WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ WebSocket connected successfully');
            this.updateStatus('✅ Connected', 'connected');
        };
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        
        this.ws.onclose = () => {
            this.updateStatus('❌ Disconnected', 'disconnected');
        };
        
        this.ws.onerror = (error) => {
            this.updateStatus('💥 Connection error', 'disconnected');
        };
    }

    handleMessage(message) {
        console.log('📨 Handling message:', message.type);
        
        switch (message.type) {
            case 'welcome':
                this.userId = message.userId;
                this.userColor = message.color;
                this.addUser(message.userId, 'You', message.color);
                break;
                
            case 'user-joined':
                if (message.userId !== this.userId) {
                    this.addUser(message.userId, message.name, message.color);
                }
                break;
                
            case 'user-list':
                this.users.clear();
                message.data.forEach(user => {
                    const displayName = user.id === this.userId ? 'You' : user.name;
                    this.addUser(user.id, displayName, user.color);
                });
                break;
                
            case 'user-left':
                this.removeUser(message.userId);
                break;
                
            case 'canvas-state':
                // Load existing canvas state
                if (message.stateData) {
                    this.canvas.loadState(message.stateData);
                }
                break;
                
            case 'draw-start':
                this.canvas.drawRemote(message.x, message.y, message.color, message.size, true);
                break;
                
            case 'draw-move':
                this.canvas.drawRemote(message.x, message.y, message.color, message.size);
                break;
                
            case 'cursor-move':
                this.updateRemoteCursor(message.userId, message.x, message.y, message.color);
                break;
                
            case 'clear':
                this.canvas.clear();
                break;
                
            case 'undo':
                if (message.stateData) {
                    this.canvas.loadState(message.stateData);
                } else {
                    this.canvas.clear(); // Empty canvas
                }
                this.updateUndoRedoButtons();
                break;
                
            case 'redo':
                if (message.stateData) {
                    this.canvas.loadState(message.stateData);
                }
                this.updateUndoRedoButtons();
                break;
                
            case 'save-state':
                // Server requests state save - send our current canvas
                this.saveCanvasState();
                break;
                
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    saveCanvasState() {
        const stateData = this.canvas.getStateData();
        this.send({
            type: 'save-state',
            stateData: stateData
        });
    }

    updateUndoRedoButtons() {
        // This would enable/disable buttons based on history
        // For now, we'll keep buttons always enabled
    }

    redrawFromHistory() {
        this.canvas.clear();
        
        // Redraw all strokes up to current history index
        for (let i = 0; i <= this.currentHistoryIndex; i++) {
            const stroke = this.drawingHistory[i];
            if (stroke && stroke.length > 0) {
                // Draw the entire stroke
                for (let j = 0; j < stroke.length; j++) {
                    const point = stroke[j];
                    if (point.type === 'draw-start') {
                        this.canvas.drawRemote(point.x, point.y, point.color, point.size, true);
                    } else {
                        this.canvas.drawRemote(point.x, point.y, point.color, point.size);
                    }
                }
            }
        }
    }

    setupUI() {
        // Tool buttons
        document.getElementById('brush-btn').onclick = () => {
            this.setActiveTool('brush');
            this.canvas.setTool('brush');
        };
        
        document.getElementById('eraser-btn').onclick = () => {
            this.setActiveTool('eraser');
            this.canvas.setTool('eraser');
        };

        // Color picker
        document.getElementById('color-picker').oninput = (e) => {
            this.canvas.setColor(e.target.value);
        };

        // Size slider
        const sizeSlider = document.getElementById('size-slider');
        const sizeValue = document.getElementById('size-value');
        
        sizeSlider.oninput = (e) => {
            const size = parseInt(e.target.value);
            sizeValue.textContent = size;
            this.canvas.setSize(size);
        };

        // Action buttons
        document.getElementById('undo-btn').onclick = () => this.sendUndo();
        document.getElementById('redo-btn').onclick = () => this.sendRedo();
        document.getElementById('clear-btn').onclick = () => this.sendClear();
        document.getElementById('download-btn').onclick = () => this.canvas.download();
    }

    setupEventListeners() {
        // Canvas drawing events
        this.canvas.onDrawStart = (x, y) => {
            this.isDrawing = true;
            this.sendDrawStart(x, y);
        };
        
        this.canvas.onDraw = (x, y) => {
            this.sendDrawMove(x, y);
        };
        
        this.canvas.onDrawEnd = () => {
            this.isDrawing = false;
            this.sendDrawEnd();
            
            // Save canvas state after drawing completes
            setTimeout(() => {
                this.saveCanvasState();
            }, 100);
        };

        // Cursor movement
        this.canvas.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDrawing) {
                const pos = this.canvas.getMousePos(e);
                this.sendCursorMove(pos.x, pos.y);
            }
        });

        // Window resize
        window.addEventListener('resize', () => {
            this.canvas.resize();
        });
    }

    sendDrawStart(x, y) {
        this.send({
            type: 'draw-start',
            x, y,
            // ✅ Send the ACTUAL current color, not a default
            color: this.canvas.currentTool === 'eraser' ? '#FFFFFF' : this.canvas.currentColor,
            size: this.canvas.currentSize
        });
    }

    sendDrawMove(x, y) {
        this.send({
            type: 'draw-move',
            x, y,
            // ✅ Send the ACTUAL current color, not a default  
            color: this.canvas.currentTool === 'eraser' ? '#FFFFFF' : this.canvas.currentColor,
            size: this.canvas.currentSize
        });
    }

    sendDrawEnd() {
        this.send({ type: 'draw-end' });
    }

    sendCursorMove(x, y) {
        this.send({
            type: 'cursor-move',
            x, y
        });
    }

    sendClear() {
        this.send({ type: 'clear' });
        this.canvas.clear();
    }

    sendUndo() {
        this.send({ type: 'undo' });
    }

    sendRedo() {
        this.send({ type: 'redo' });
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    setActiveTool(tool) {
        document.getElementById('brush-btn').classList.toggle('active', tool === 'brush');
        document.getElementById('eraser-btn').classList.toggle('active', tool === 'eraser');
    }

    addUser(userId, name, color) {
        this.users.set(userId, { name, color });
        this.updateUsersDisplay();
    }

    removeUser(userId) {
        this.users.delete(userId);
        this.removeRemoteCursor(userId);
        this.updateUsersDisplay();
    }

    updateUsersDisplay() {
        const usersCount = document.getElementById('users-count');
        const usersList = document.getElementById('users-list');
        
        usersCount.textContent = `${this.users.size} user${this.users.size !== 1 ? 's' : ''}`;
        
        usersList.innerHTML = '';
        this.users.forEach((user, userId) => {
            const userDot = document.createElement('div');
            userDot.className = 'user-dot';
            userDot.style.backgroundColor = user.color;
            userDot.title = user.name;
            usersList.appendChild(userDot);
        });
    }

    updateRemoteCursor(userId, x, y, color) {
        let cursor = document.getElementById(`cursor-${userId}`);
        
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = `cursor-${userId}`;
            cursor.className = 'remote-cursor';
            cursor.style.backgroundColor = color;
            document.getElementById('cursors').appendChild(cursor);
        }
        
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
    }

    removeRemoteCursor(userId) {
        const cursor = document.getElementById(`cursor-${userId}`);
        if (cursor) cursor.remove();
    }

    updateStatus(text, className) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = text;
        statusEl.className = className;
    }
}

// Start the app when page loads
document.addEventListener('DOMContentLoaded', () => {
    new CollaborativeApp();
});