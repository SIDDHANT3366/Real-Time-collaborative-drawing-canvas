class DrawingCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        
        this.currentTool = 'brush';
        this.currentColor = '#000000';
        this.currentSize = 3;
        
        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        // Make canvas full size of its container
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        
        // White background
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    getStateData() {
        return this.canvas.toDataURL(); // Returns base64 image
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        // Touch support for mobile
        this.canvas.addEventListener('touchstart', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    getTouchPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    }

    startDrawing(e) {
        this.isDrawing = true;
        const pos = e.type.includes('touch') ? this.getTouchPos(e) : this.getMousePos(e);
        
        this.lastX = pos.x;
        this.lastY = pos.y;
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        
        // Notify about drawing start
        if (this.onDrawStart) {
            this.onDrawStart(pos.x, pos.y);
        }
    }

    draw(e) {
        if (!this.isDrawing) return;
        
        e.preventDefault();
        const pos = e.type.includes('touch') ? this.getTouchPos(e) : this.getMousePos(e);
        
        // Set drawing style
        this.ctx.lineWidth = this.currentSize;
        this.ctx.strokeStyle = this.currentTool === 'eraser' ? 'white' : this.currentColor;
        
        // Draw line
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
        
        // Notify about drawing
        if (this.onDraw) {
            this.onDraw(pos.x, pos.y);
        }
        
        this.lastX = pos.x;
        this.lastY = pos.y;
    }

    stopDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        this.ctx.closePath();
        
        // Notify about drawing end
        if (this.onDrawEnd) {
            this.onDrawEnd();
        }
    }

    loadState(stateData) {
        if (!stateData) {
            this.clear();
            return;
        }
        
        const img = new Image();
        img.onload = () => {
            // Clear and redraw the saved state
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = stateData;
    }

    handleTouch(e) {
        e.preventDefault();
        if (e.type === 'touchstart') {
            this.startDrawing(e);
        } else if (e.type === 'touchmove') {
            this.draw(e);
        }
    }

    // Draw from remote user
    drawRemote(x, y, color, size, isStart = false) {
        // Save current drawing state
        const originalStrokeStyle = this.ctx.strokeStyle;
        const originalLineWidth = this.ctx.lineWidth;
        
        // Set remote user's style
        this.ctx.lineWidth = size;
        this.ctx.strokeStyle = color; // ← Use the color from message
        
        if (isStart) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
        } else {
            this.ctx.lineTo(x, y);
            this.ctx.stroke();
        }
        
        // Restore original drawing state (for local drawing)
        this.ctx.strokeStyle = originalStrokeStyle;
        this.ctx.lineWidth = originalLineWidth;
    }

    clear() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Reset drawing state
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineWidth = this.currentSize;
        this.ctx.strokeStyle = this.currentTool === 'eraser' ? 'white' : this.currentColor;
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    setColor(color) {
        this.currentColor = color;
    }

    setSize(size) {
        this.currentSize = size;
    }

    resize() {
        const currentImage = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        
        this.ctx.putImageData(currentImage, 0, 0);
    }

    download() {
        const link = document.createElement('a');
        link.download = 'collaborative-drawing.png';
        link.href = this.canvas.toDataURL();
        link.click();
    }
}