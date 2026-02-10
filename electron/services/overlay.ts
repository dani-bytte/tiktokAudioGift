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

    // CORS headers - allow audio to be fetched from any origin
    this.app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        next();
    });

    // Content-Type map for audio files
    const AUDIO_CONTENT_TYPES: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
    };

    this.app.get('/audio/:id', (req: Request, res: Response) => {
      const id = req.params.id as string;
      const audioPath = this.audioFiles.get(id);
      
      if (!audioPath) {
        console.error(`[Overlay] Audio ID not found: ${id}`);
        return res.status(404).send('Audio not found');
      }

      const normalizedPath = path.normalize(audioPath);
      const ext = path.extname(normalizedPath).toLowerCase();
      
      if (!AUDIO_CONTENT_TYPES[ext]) {
        console.error(`[Overlay] Blocked access to non-audio file: ${normalizedPath}`);
        return res.status(403).send('Forbidden');
      }

      // Set proper Content-Type header
      res.setHeader('Content-Type', AUDIO_CONTENT_TYPES[ext]);
      // Allow range requests for audio seeking
      res.setHeader('Accept-Ranges', 'bytes');

      console.log(`[Overlay] Serving audio: ${normalizedPath} (${ext})`);

      res.sendFile(normalizedPath, (err: Error | null) => {
        if (err) {
          console.error('[Overlay] Failed to send audio file:', err);
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

    // Debug diagnostic page for troubleshooting audio on other PCs
    this.app.get('/debug', (_req: Request, res: Response) => {
      res.send(DEBUG_HTML);
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


const DEBUG_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Audio Debug - TikTok Audio Gift</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0f0f1a;
            color: #e2e8f0;
            font-family: 'Segoe UI', sans-serif;
            padding: 24px;
        }
        h1 { color: #a78bfa; margin-bottom: 8px; font-size: 24px; }
        h2 { color: #818cf8; margin: 20px 0 10px; font-size: 18px; }
        .subtitle { color: #64748b; font-size: 13px; margin-bottom: 20px; }
        .card {
            background: #1e1e2e;
            border: 1px solid #2d2d44;
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; }
        .label { color: #94a3b8; }
        .value { font-weight: 600; }
        .ok { color: #22c55e; }
        .warn { color: #f59e0b; }
        .err { color: #ef4444; }
        button {
            background: #6366f1;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            margin: 4px;
        }
        button:hover { background: #4f46e5; }
        button:disabled { background: #374151; cursor: not-allowed; }
        #logs {
            background: #0a0a14;
            border: 1px solid #2d2d44;
            border-radius: 8px;
            padding: 12px;
            font-family: 'Cascadia Code', 'Fira Code', monospace;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .log-info { color: #60a5fa; }
        .log-ok { color: #22c55e; }
        .log-err { color: #ef4444; }
        .log-warn { color: #f59e0b; }
    </style>
</head>
<body>
    <h1>🔧 Audio Debug</h1>
    <p class="subtitle">Diagnostic page for troubleshooting audio playback issues</p>

    <h2>System Info</h2>
    <div class="card">
        <div class="row"><span class="label">User Agent</span><span class="value" id="ua"></span></div>
        <div class="row"><span class="label">AudioContext</span><span class="value" id="actx-support"></span></div>
        <div class="row"><span class="label">AudioContext State</span><span class="value" id="actx-state"></span></div>
        <div class="row"><span class="label">WebSocket</span><span class="value" id="ws-status"></span></div>
        <div class="row"><span class="label">Sample Rate</span><span class="value" id="sample-rate"></span></div>
    </div>

    <h2>Tests</h2>
    <div class="card">
        <button onclick="testAudioContext()">1. Test AudioContext</button>
        <button onclick="testBeep()">2. Play Test Beep</button>
        <button onclick="testFetchAudio()">3. Test Audio Fetch (needs audio in queue)</button>
        <button onclick="testWs()">4. Test WebSocket</button>
        <button id="btn-clear" onclick="clearLogs()">Clear Logs</button>
    </div>

    <h2>Logs</h2>
    <div id="logs"></div>

    <script>
        const logsEl = document.getElementById('logs');
        let audioCtx = null;
        let ws = null;

        // Logging
        function log(msg, type = 'info') {
            const cls = type === 'ok' ? 'log-ok' : type === 'err' ? 'log-err' : type === 'warn' ? 'log-warn' : 'log-info';
            const time = new Date().toLocaleTimeString();
            logsEl.innerHTML += '<span class="' + cls + '">[' + time + '] ' + msg + '</span>\\n';
            logsEl.scrollTop = logsEl.scrollHeight;
        }

        function clearLogs() { logsEl.innerHTML = ''; }

        // System info
        document.getElementById('ua').textContent = navigator.userAgent.substring(0, 80) + '...';

        const hasAudioCtx = !!(window.AudioContext || window.webkitAudioContext);
        const actxEl = document.getElementById('actx-support');
        actxEl.textContent = hasAudioCtx ? 'Supported ✓' : 'NOT SUPPORTED ✗';
        actxEl.className = 'value ' + (hasAudioCtx ? 'ok' : 'err');

        function updateActxState() {
            const el = document.getElementById('actx-state');
            if (!audioCtx) { el.textContent = 'Not created'; el.className = 'value warn'; return; }
            el.textContent = audioCtx.state;
            el.className = 'value ' + (audioCtx.state === 'running' ? 'ok' : audioCtx.state === 'suspended' ? 'warn' : 'err');
            document.getElementById('sample-rate').textContent = audioCtx.sampleRate + ' Hz';
        }

        // Test 1: AudioContext
        function testAudioContext() {
            log('Testing AudioContext...');
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                log('AudioContext created. State: ' + audioCtx.state, audioCtx.state === 'running' ? 'ok' : 'warn');
                
                audioCtx.resume().then(() => {
                    log('AudioContext.resume() succeeded. State: ' + audioCtx.state, 'ok');
                    updateActxState();
                }).catch(e => {
                    log('AudioContext.resume() FAILED: ' + e.message, 'err');
                    updateActxState();
                });
                updateActxState();
            } catch (e) {
                log('AudioContext creation FAILED: ' + e.message, 'err');
            }
        }

        // Test 2: Play beep
        function testBeep() {
            log('Playing test beep...');
            if (!audioCtx) {
                log('Creating AudioContext first...', 'warn');
                testAudioContext();
            }
            try {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.value = 440;
                gain.gain.value = 0.3;
                osc.start();
                osc.stop(audioCtx.currentTime + 0.3);
                osc.onended = () => log('Beep finished. If you heard it, audio is working!', 'ok');
                log('Beep started (440Hz, 0.3s)', 'ok');
            } catch (e) {
                log('Beep FAILED: ' + e.message, 'err');
            }
        }

        // Test 3: Fetch audio from server
        function testFetchAudio() {
            log('Testing audio fetch from server...');
            const testUrl = window.location.origin + '/audio/test';
            fetch(testUrl).then(r => {
                log('Fetch response: ' + r.status + ' ' + r.statusText + ' Content-Type: ' + r.headers.get('Content-Type'), r.ok ? 'ok' : 'warn');
                if (r.status === 404) {
                    log('This is expected if no audio has been queued yet. Try triggering a gift first.', 'warn');
                }
            }).catch(e => {
                log('Fetch FAILED: ' + e.message, 'err');
            });

            // Also test with Audio element
            log('Testing new Audio() playback...');
            const audio = new Audio();
            audio.onerror = (e) => log('Audio element error: ' + (audio.error ? audio.error.message : 'unknown'), 'err');
            audio.oncanplay = () => log('Audio canplay event fired', 'ok');
            log('Audio element created. canPlayType mp3: "' + audio.canPlayType('audio/mpeg') + '", wav: "' + audio.canPlayType('audio/wav') + '", ogg: "' + audio.canPlayType('audio/ogg') + '"');
        }

        // Test 4: WebSocket
        function testWs() {
            log('Testing WebSocket connection...');
            try {
                const testWs = new WebSocket('ws://' + window.location.host);
                testWs.onopen = () => {
                    log('WebSocket connected!', 'ok');
                    document.getElementById('ws-status').textContent = 'Connected ✓';
                    document.getElementById('ws-status').className = 'value ok';
                    testWs.close();
                };
                testWs.onerror = () => {
                    log('WebSocket connection FAILED', 'err');
                    document.getElementById('ws-status').textContent = 'Failed ✗';
                    document.getElementById('ws-status').className = 'value err';
                };
            } catch (e) {
                log('WebSocket test FAILED: ' + e.message, 'err');
            }
        }

        // Auto-run diagnostics
        log('Debug page loaded. Running initial diagnostics...', 'info');
        testAudioContext();
        setTimeout(testWs, 500);
    </script>
</body>
</html>`;
