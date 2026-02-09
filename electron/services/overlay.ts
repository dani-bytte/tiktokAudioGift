import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { EventEmitter } from 'events';
import path from 'path';

export interface PlayAudioMessage {
  type: 'play-audio';
  data: {
    audioUrl: string;
    volume: number;
    giftName: string;
    username: string;
    giftId: string;
  };
}

export interface OverlayMessage {
  type: string;
  data?: any;
}

class OverlayServer extends EventEmitter {
  private app = express();
  private server = createServer(this.app);
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number = 3847;
  private isRunning: boolean = false;
  // Map of audio ID to absolute file path
  private audioFiles: Map<string, string> = new Map();
  // Track queue size and progress on server side
  private queueSize: number = 0;
  private totalInBatch: number = 0;
  private currentPlaying: number = 0;
  // Track audio durations for time estimation
  private totalDurationPlayed: number = 0;
  private audioCount: number = 0;
  // Track pending audio durations for estimated time
  private pendingDurations: number[] = [];

  
  registerAudioFile(audioPath: string): string {
    
    if (!/\.(mp3|wav|ogg|m4a|flac)$/i.test(audioPath)) {
        console.error(`[Overlay] Blocked attempt to register non-audio file: ${audioPath}`);
        return '';
    }

    const id = Buffer.from(audioPath).toString('base64url');
    this.audioFiles.set(id, audioPath);
    return `/audio/${id}`;
  }

  async start(port: number = 3847, libraryPath?: string): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.port = port;

    
    const rateLimit = new Map<string, { count: number, resetTime: number }>();
    const WINDOW_MS = 10000;
    const MAX_REQUESTS = 100;

    this.app.use((req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const record = rateLimit.get(ip);

        
        if (!record || now > record.resetTime) {
            rateLimit.set(ip, { count: 1, resetTime: now + WINDOW_MS });
            return next();
        }

        
        record.count++;
        if (record.count > MAX_REQUESTS) {
            console.warn(`[Overlay] Rate limit exceeded for IP ${ip}`);
            return res.status(429).send('Too Many Requests');
        }

        next();
    });

    
    this.app.get('/audio/:id', (req: Request, res: Response) => {
      const id = req.params.id as string;
      const audioPath = this.audioFiles.get(id);
      
      if (!audioPath) {
        return res.status(404).send('Audio not found');
      }

      
      
      const normalizedPath = path.normalize(audioPath);
      
      
      if (!/\.(mp3|wav|ogg|m4a|flac)$/i.test(normalizedPath)) {
        console.error(`[Overlay] Blocked access to non-audio file: ${normalizedPath}`);
        return res.status(403).send('Forbidden');
      }

      res.sendFile(normalizedPath, (err: Error | null) => {
        if (err) {
          console.error('Failed to send audio file:', err);
          if (!res.headersSent) {
             res.status(404).send('Audio file not found');
          }
        }
      });
    });

    
    if (libraryPath) {
      console.log('Serving audio library from:', libraryPath);
      
      this.app.use('/library', express.static(libraryPath, {
        dotfiles: 'deny',
        index: false,
        extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'],
      }));
    }

    
    this.app.get('/', (_req: Request, res: Response) => {
      res.send(OVERLAY_HTML);
    });

    
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      console.log('Overlay client connected');
      this.clients.add(ws);
      this.emit('clientConnected');

      
      ws.send(JSON.stringify({ type: 'connected' }));

      ws.on('close', () => {
        console.log('Overlay client disconnected');
        this.clients.delete(ws);
        this.emit('clientDisconnected');
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          // Handle queue updates from client
          if (msg.type === 'audio-ended') {
            // Track duration if provided
            if (msg.duration && typeof msg.duration === 'number') {
              this.totalDurationPlayed += msg.duration;
              this.audioCount++;
            }
            // Remove first pending duration (FIFO)
            if (this.pendingDurations.length > 0) {
              this.pendingDurations.shift();
            }
            this.queueSize = Math.max(0, this.queueSize - 1);
            this.currentPlaying++;
            // Emit progress update
            this.emit('queueProgress', {
              current: this.currentPlaying,
              total: this.totalInBatch,
              remaining: this.queueSize
            });
            // Reset if queue is empty
            if (this.queueSize === 0) {
              this.currentPlaying = 0;
              this.totalInBatch = 0;
              // Reset duration tracking for next batch
              this.totalDurationPlayed = 0;
              this.audioCount = 0;
              this.pendingDurations = [];
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
      ws.on('error', (error) => { // This was misplaced, moved it here
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    return new Promise((resolve, reject) => {
      this.server.listen(port, '127.0.0.1', () => {
        console.log(`Overlay server running on http://localhost:${port}`);
        this.isRunning = true;
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('Server error:', error);
        reject(error);
      });
    });
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.server.close();
    this.isRunning = false;
    this.clients.clear();
  }

  getConnectedCount(): number {
    return this.clients.size;
  }

  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  broadcast(message: OverlayMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  playAudio(giftId: string, giftName: string, username: string, audioPath: string, volume: number, duration: number = 0): void {
    // Register the audio file and get a URL for it
    const audioUrl = this.registerAudioFile(audioPath);
    
    const message: PlayAudioMessage = {
      type: 'play-audio',
      data: {
        audioUrl,
        volume,
        giftName,
        username,
        giftId,
      },
    };
    console.log('Broadcasting audio play:', audioUrl, 'volume:', volume, 'duration:', duration);
    this.broadcast(message);
    // Track batch totals for progress
    // Only reset if queue was empty (starting new batch)
    const wasEmpty = this.queueSize === 0;
    this.queueSize++;
    
    // Track duration for time estimation
    this.pendingDurations.push(duration);
    
    if (wasEmpty) {
      // Starting a new batch
      this.totalInBatch = 1;
      this.currentPlaying = 0;
    } else {
      // Adding to existing batch - increment total
      this.totalInBatch++;
    }
  }

  // Get current queue progress with time estimation
  getQueueProgress(): { current: number; total: number; remaining: number; estimatedSeconds: number } {
    // Calculate estimated time from pending durations
    const estimatedSeconds = Math.round(this.pendingDurations.reduce((a, b) => a + b, 0));
    return {
      current: this.currentPlaying,
      total: this.totalInBatch,
      remaining: this.queueSize,
      estimatedSeconds
    };
  }

  
  clearQueue(): void {
    this.broadcast({ type: 'clear-queue' });
    this.queueSize = 0; // Reset server-side queue size
    console.log('[Overlay] Queue cleared');
  }
}

export const overlayServer = new OverlayServer();


const OVERLAY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TikTok Gift Audio Overlay</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: transparent;
            overflow: hidden;
        }
        #status {
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 12px;
            background: rgba(0,0,0,0.5);
            color: white;
            font-family: 'Segoe UI', sans-serif;
            z-index: 100;
        }
        #status.connected { background: rgba(34, 197, 94, 0.8); }
        #status.disconnected { background: rgba(239, 68, 68, 0.8); }

        /* Audio enable overlay */
        #audio-enable-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            cursor: pointer;
            transition: opacity 0.4s ease;
        }
        #audio-enable-overlay.hidden {
            opacity: 0;
            pointer-events: none;
        }
        #audio-enable-overlay .icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        #audio-enable-overlay .title {
            color: white;
            font-family: 'Segoe UI', sans-serif;
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        #audio-enable-overlay .subtitle {
            color: rgba(255,255,255,0.6);
            font-family: 'Segoe UI', sans-serif;
            font-size: 13px;
        }
        #audio-enable-overlay .pulse-ring {
            position: absolute;
            width: 120px;
            height: 120px;
            border-radius: 50%;
            border: 2px solid rgba(34, 197, 94, 0.4);
            animation: pulse 2s ease-out infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.8); opacity: 1; }
            100% { transform: scale(1.8); opacity: 0; }
        }
    </style>
</head>
<body>
    <div id="status" class="disconnected">Disconnected</div>

    <!-- Click-to-enable audio overlay: user clicks once to unlock AudioContext -->
    <div id="audio-enable-overlay">
        <div class="pulse-ring"></div>
        <div class="icon">🔊</div>
        <div class="title">Click to Enable Audio</div>
        <div class="subtitle">Required by browser to allow audio playback</div>
    </div>

    <script>
        const status = document.getElementById('status');
        const enableOverlay = document.getElementById('audio-enable-overlay');
        let ws = null;
        let reconnectInterval = null;

        // Audio state
        const audioQueue = [];
        let isPlaying = false;
        let currentAudio = null;

        // AudioContext for unlocking autoplay
        let audioCtx = null;
        let audioUnlocked = false;

        // Try to create and resume AudioContext immediately
        // Some environments (like OBS with "Control audio via OBS") allow this without interaction
        function tryAutoUnlock() {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'running') {
                    // Already unlocked! (e.g. OBS with proper settings)
                    audioUnlocked = true;
                    enableOverlay.classList.add('hidden');
                    console.log('[Overlay] AudioContext auto-unlocked');
                    return;
                }
                // Try to resume - might work in some environments
                audioCtx.resume().then(() => {
                    if (audioCtx.state === 'running') {
                        audioUnlocked = true;
                        enableOverlay.classList.add('hidden');
                        console.log('[Overlay] AudioContext resumed automatically');
                    }
                }).catch(() => {});
            } catch (e) {
                console.warn('[Overlay] AudioContext creation failed:', e);
            }
        }

        // Unlock audio on user click
        function unlockAudio() {
            if (audioUnlocked) return;

            try {
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                
                // Resume the context
                audioCtx.resume().then(() => {
                    // Play a silent buffer to fully unlock audio playback
                    const buffer = audioCtx.createBuffer(1, 1, 22050);
                    const source = audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(audioCtx.destination);
                    source.start(0);

                    audioUnlocked = true;
                    enableOverlay.classList.add('hidden');
                    console.log('[Overlay] Audio unlocked by user interaction');

                    // Process any queued audio that arrived before unlock
                    processQueue();
                }).catch(e => {
                    console.error('[Overlay] Failed to resume AudioContext:', e);
                });
            } catch (e) {
                // Fallback: just hide overlay and try playing anyway
                audioUnlocked = true;
                enableOverlay.classList.add('hidden');
                processQueue();
            }
        }

        // Attach click handler to enable overlay
        enableOverlay.addEventListener('click', unlockAudio);
        // Also unlock on any click/touch on the page
        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('touchstart', unlockAudio, { once: true });

        // Try auto-unlock on load
        tryAutoUnlock();

        function connect() {
            ws = new WebSocket('ws://' + window.location.host);

            ws.onopen = () => {
                status.textContent = 'Connected';
                status.className = 'connected';
                if (reconnectInterval) {
                    clearInterval(reconnectInterval);
                    reconnectInterval = null;
                }
            };

            ws.onclose = () => {
                status.textContent = 'Disconnected';
                status.className = 'disconnected';
                if (!reconnectInterval) {
                    reconnectInterval = setInterval(connect, 3000);
                }
            };

            ws.onerror = () => ws.close();

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleMessage(msg);
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };
        }

        function handleMessage(msg) {
            if (msg.type === 'play-audio') {
                audioQueue.push({
                    url: msg.data.audioUrl,
                    volume: msg.data.volume
                });
                processQueue();
            } else if (msg.type === 'get-queue-size') {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'queue-size',
                        data: audioQueue.length + (isPlaying ? 1 : 0)
                    }));
                }
            } else if (msg.type === 'clear-queue') {
                audioQueue.length = 0;
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio = null;
                }
                isPlaying = false;
                console.log('Queue cleared');
            }
        }

        function processQueue() {
            // Don't process if audio isn't unlocked yet — items stay queued
            if (!audioUnlocked || isPlaying || audioQueue.length === 0) {
                return;
            }

            isPlaying = true;
            const item = audioQueue.shift();

            playAudio(item.url, item.volume, () => {
                isPlaying = false;
                setTimeout(processQueue, 100);
            });
        }

        function playAudio(url, volume, onEnded) {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }

            // Ensure AudioContext is running before playing
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }

            const audio = new Audio(url);
            currentAudio = audio;
            audio.volume = Math.min(1, Math.max(0, volume));

            // Connect to AudioContext for reliable playback
            if (audioCtx) {
                try {
                    const source = audioCtx.createMediaElementSource(audio);
                    source.connect(audioCtx.destination);
                } catch (e) {
                    // If already connected or other error, continue with normal playback
                    console.warn('[Overlay] Could not connect to AudioContext:', e);
                }
            }

            audio.onended = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'audio-ended',
                        duration: audio.duration || 0
                    }));
                }
                onEnded();
            };

            audio.onerror = (e) => {
                console.error('Audio play failed:', e);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'audio-ended' }));
                }
                onEnded();
            };

            audio.play().catch(e => {
                console.error('Audio play failed (promise):', e);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'audio-ended' }));
                }
                onEnded();
            });
        }

        connect();
    </script>
</body>
</html>`;
