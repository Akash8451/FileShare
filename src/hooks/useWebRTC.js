import { useRef, useState, useCallback, useEffect } from 'react';

const CHUNK_SIZE = 64 * 1024;       // 64KB — SCTP optimal
const LOW_WATER = 512 * 1024;       // 512KB
const HIGH_WATER = 2 * 1024 * 1024; // 2MB
const RECONNECT_MAX = 3;
const RECONNECT_DELAY = 2000;

export const CONNECTION_STATES = {
  IDLE: 'idle',
  JOINING: 'joining',
  WAITING: 'waiting',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  TRANSFERRING: 'transferring',
  COMPLETE: 'complete',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
};

const MSG_TYPES = {
  FILE_META: 'file-meta',
  FILE_ACCEPT: 'file-accept',
  FILE_REJECT: 'file-reject',
  TEXT: 'text',
};

export function useWebRTC(socket, addLog) {
  // ── Peer connection refs ──
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const speedIntervalRef = useRef(null);
  const roomCodeRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const isInitiatorRef = useRef(false);

  // ── React state (UI-facing, updated via rAF) ──
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.IDLE);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState(0);
  const [transferDirection, setTransferDirection] = useState(null);
  const [receivedFile, setReceivedFile] = useState(null);
  const [incomingFileInfo, setIncomingFileInfo] = useState(null);
  const [pendingIncoming, setPendingIncoming] = useState(null);
  const [textMessages, setTextMessages] = useState([]);
  const [iceConfig, setIceConfig] = useState(null);
  const [multiFileProgress, setMultiFileProgress] = useState(null);

  // ── Hot-path refs (updated per-chunk, NEVER trigger re-render) ──
  const transferProgressRef = useRef(0);
  const transferSpeedRef = useRef(0);

  // ── Receiver state (all refs — zero re-render overhead) ──
  const receiveBufferRef = useRef([]);
  const receivedSizeRef = useRef(0);
  const fileMetaRef = useRef(null);
  const lastBytesRef = useRef(0);

  // ── Accept/reject async coordination ──
  const pendingAcceptResolveRef = useRef(null);

  // ── Ref bridge for stable closures ──
  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;

  // ── rAF loop: sync refs → state at display refresh rate ──
  const rafRef = useRef(null);
  useEffect(() => {
    let lastProgress = -1;
    let lastSpeed = -1;
    const tick = () => {
      const p = transferProgressRef.current;
      const s = transferSpeedRef.current;
      // Only call setState when values actually change
      if (p !== lastProgress) { setTransferProgress(p); lastProgress = p; }
      if (s !== lastSpeed) { setTransferSpeed(s); lastSpeed = s; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Fetch ICE config on mount ──
  useEffect(() => {
    fetch('/api/ice-config')
      .then(r => r.json())
      .then(config => {
        setIceConfig(config);
        addLogRef.current('ICE configuration loaded', 'info');
      })
      .catch(() => {
        setIceConfig({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
      });
  }, []);

  const clearSpeedInterval = useCallback(() => {
    if (speedIntervalRef.current) {
      clearInterval(speedIntervalRef.current);
      speedIntervalRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearSpeedInterval();
    if (dcRef.current) {
      try { dcRef.current.close(); } catch {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
  }, [clearSpeedInterval]);

  // ── Data channel message handler (stable via ref bridge) ──
  const handleControlMessage = useCallback((msg) => {
    switch (msg.type) {
      case MSG_TYPES.FILE_META:
        setPendingIncoming({
          name: msg.name,
          size: msg.size,
          mime: msg.mime,
          fileIndex: msg.fileIndex,
          totalFiles: msg.totalFiles,
        });
        addLogRef.current(`Incoming: ${msg.name} (${(msg.size / 1024 / 1024).toFixed(2)} MB)`, 'info');
        break;

      case MSG_TYPES.FILE_ACCEPT:
        if (pendingAcceptResolveRef.current) {
          pendingAcceptResolveRef.current(true);
          pendingAcceptResolveRef.current = null;
        }
        break;

      case MSG_TYPES.FILE_REJECT:
        if (pendingAcceptResolveRef.current) {
          pendingAcceptResolveRef.current(false);
          pendingAcceptResolveRef.current = null;
        }
        addLogRef.current('Peer rejected the file.', 'warning');
        break;

      case MSG_TYPES.TEXT:
        setTextMessages(prev => [...prev, {
          text: msg.text,
          from: 'peer',
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        }]);
        addLogRef.current(`Text received: "${msg.text.slice(0, 50)}${msg.text.length > 50 ? '...' : ''}"`, 'info');
        break;

      default:
        break;
    }
  }, []); // ← stable: no deps, uses refs

  // Ref bridge so data channel always calls the latest handleControlMessage
  const handleControlMessageRef = useRef(handleControlMessage);
  handleControlMessageRef.current = handleControlMessage;

  const setupDataChannelListeners = useCallback((channel) => {
    channel.binaryType = 'arraybuffer';

    channel.onerror = (error) => {
      console.error('DataChannel Error:', error);
      addLogRef.current('Channel error! Check console.', 'error');
    };

    channel.onclose = () => {
      addLogRef.current('Data channel closed.', 'warning');
      clearSpeedInterval();
    };

    channel.onopen = () => {
      addLogRef.current('P2P tunnel established!', 'success');
      setConnectionState(CONNECTION_STATES.CONNECTED);
      reconnectCountRef.current = 0;
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          handleControlMessageRef.current(msg); // ← always latest via ref
        } catch {
          addLogRef.current('Received malformed message', 'warning');
        }
      } else {
        // ── Binary chunk — HOT PATH (zero React overhead) ──
        receiveBufferRef.current.push(event.data);
        receivedSizeRef.current += event.data.byteLength;

        const meta = fileMetaRef.current;
        if (meta) {
          // Update ref only — rAF loop syncs to state
          if (receiveBufferRef.current.length % 100 === 0 || receivedSizeRef.current >= meta.size) {
            transferProgressRef.current = Math.round((receivedSizeRef.current / meta.size) * 100);
          }

          if (receivedSizeRef.current >= meta.size) {
            clearSpeedInterval();
            transferSpeedRef.current = 0;
            addLogRef.current('Reassembling file...', 'info');
            const blob = new Blob(receiveBufferRef.current, { type: meta.mime });
            receiveBufferRef.current = [];

            const url = URL.createObjectURL(blob);
            setReceivedFile({ url, name: meta.name, mime: meta.mime, size: meta.size });
            transferProgressRef.current = 100;
            setConnectionState(CONNECTION_STATES.COMPLETE);
            addLogRef.current(`✓ Received ${meta.name}!`, 'success');
          }
        }
      }
    };
  }, [clearSpeedInterval]); // ← stable: no handleControlMessage dep

  // ── Reconnection ──
  const attemptReconnect = useCallback(async () => {
    const s = socket.current;
    const room = roomCodeRef.current;
    if (!s || !room || reconnectCountRef.current >= RECONNECT_MAX) {
      addLogRef.current('Reconnection failed. Max retries reached.', 'error');
      setConnectionState(CONNECTION_STATES.DISCONNECTED);
      return;
    }

    reconnectCountRef.current++;
    setConnectionState(CONNECTION_STATES.RECONNECTING);
    addLogRef.current(`Reconnecting... (${reconnectCountRef.current}/${RECONNECT_MAX})`, 'warning');

    cleanup();
    await new Promise(r => setTimeout(r, RECONNECT_DELAY));
    s.emit('join-room', room);
  }, [socket, cleanup]);

  // ── Peer connection factory ──
  const initializePeerConnection = useCallback(() => {
    const config = iceConfig || {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const pc = new RTCPeerConnection({ ...config, iceCandidatePoolSize: 10 });
    pcRef.current = pc;

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      addLogRef.current(`Network: ${state}`, state === 'connected' ? 'success' : 'info');

      if (state === 'connected') {
        setConnectionState(CONNECTION_STATES.CONNECTED);
        reconnectCountRef.current = 0;
        pc.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              const isRelayed = report.remoteCandidateId?.includes('relay') ||
                report.localCandidateId?.includes('relay');
              addLogRef.current(`Route: ${isRelayed ? 'Relayed (TURN)' : 'Direct P2P'}`, 'info');
            }
          });
        });
      }

      if (state === 'disconnected') {
        addLogRef.current('ICE disconnected — will retry...', 'warning');
        setTimeout(() => {
          if (pcRef.current?.iceConnectionState === 'disconnected') {
            attemptReconnect();
          }
        }, 3000);
      }

      if (state === 'failed') {
        setConnectionState(CONNECTION_STATES.DISCONNECTED);
        clearSpeedInterval();
        addLogRef.current('Connection failed!', 'error');
        attemptReconnect();
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket.current) {
        socket.current.emit('send-ice-candidate', event.candidate);
      }
    };

    pc.ondatachannel = (event) => {
      dcRef.current = event.channel;
      setupDataChannelListeners(event.channel);
    };

    return pc;
  }, [socket, iceConfig, clearSpeedInterval, setupDataChannelListeners, attemptReconnect]);

  // ── Socket signaling listeners ──
  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    const onUserJoined = async (userId) => {
      addLogRef.current('Peer joined! Initiating P2P...', 'info');
      isInitiatorRef.current = true;
      const pc = initializePeerConnection();
      setConnectionState(CONNECTION_STATES.CONNECTING);

      const dc = pc.createDataChannel('fileTransferChannel', { ordered: true });
      dcRef.current = dc;
      setupDataChannelListeners(dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      s.emit('send-offer', offer);
    };

    const onReceiveOffer = async (offer) => {
      addLogRef.current('Received offer, establishing tunnel...', 'info');
      isInitiatorRef.current = false;
      const pc = initializePeerConnection();
      setConnectionState(CONNECTION_STATES.CONNECTING);

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit('send-answer', answer);
    };

    const onReceiveAnswer = async (answer) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const onReceiveIce = async (candidate) => {
      if (pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('ICE candidate error:', e);
        }
      }
    };

    const onUserLeft = () => {
      addLogRef.current('Peer disconnected.', 'warning');
      setConnectionState(CONNECTION_STATES.DISCONNECTED);
      cleanup();
    };

    s.on('user-joined', onUserJoined);
    s.on('receive-offer', onReceiveOffer);
    s.on('receive-answer', onReceiveAnswer);
    s.on('receive-ice-candidate', onReceiveIce);
    s.on('user-left', onUserLeft);

    return () => {
      s.off('user-joined', onUserJoined);
      s.off('receive-offer', onReceiveOffer);
      s.off('receive-answer', onReceiveAnswer);
      s.off('receive-ice-candidate', onReceiveIce);
      s.off('user-left', onUserLeft);
    };
  }, [socket, initializePeerConnection, setupDataChannelListeners, cleanup]);

  // ══════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════

  const joinRoom = useCallback((roomCode) => {
    if (socket.current) {
      cleanup();
      roomCodeRef.current = roomCode;
      reconnectCountRef.current = 0;
      setConnectionState(CONNECTION_STATES.WAITING);
      transferProgressRef.current = 0;
      transferSpeedRef.current = 0;
      setReceivedFile(null);
      setIncomingFileInfo(null);
      setTransferDirection(null);
      setPendingIncoming(null);
      setTextMessages([]);
      setMultiFileProgress(null);
      socket.current.emit('join-room', roomCode);
      addLogRef.current(`Joined room: ${roomCode}`, 'info');
    }
  }, [socket, cleanup]);

  // ── Wait for peer to accept/reject ──
  const waitForAcceptance = () => {
    return new Promise((resolve) => {
      pendingAcceptResolveRef.current = resolve;
    });
  };

  // ── Accept incoming file ──
  const acceptIncoming = useCallback(() => {
    const dc = dcRef.current;
    const pending = pendingIncoming;
    if (!dc || !pending) return;

    dc.send(JSON.stringify({ type: MSG_TYPES.FILE_ACCEPT }));

    fileMetaRef.current = pending;
    receiveBufferRef.current = [];
    receivedSizeRef.current = 0;
    lastBytesRef.current = 0;
    setTransferDirection('receive');
    transferProgressRef.current = 0;
    setConnectionState(CONNECTION_STATES.TRANSFERRING);
    setIncomingFileInfo(pending);
    setPendingIncoming(null);

    if (pending.totalFiles > 1) {
      setMultiFileProgress({
        current: pending.fileIndex + 1,
        total: pending.totalFiles,
        currentName: pending.name,
      });
    }

    clearSpeedInterval();
    speedIntervalRef.current = setInterval(() => {
      const speed = receivedSizeRef.current - lastBytesRef.current;
      transferSpeedRef.current = speed; // ← ref, not setState
      lastBytesRef.current = receivedSizeRef.current;
    }, 1000);
  }, [pendingIncoming, clearSpeedInterval]);

  // ── Reject incoming file ──
  const rejectIncoming = useCallback(() => {
    const dc = dcRef.current;
    if (dc) {
      dc.send(JSON.stringify({ type: MSG_TYPES.FILE_REJECT }));
    }
    setPendingIncoming(null);
    addLogRef.current('Rejected incoming file.', 'warning');
  }, []);

  // ══════════════════════════════════════
  //  HIGH-SPEED SENDER (async/await, zero React overhead in hot path)
  // ══════════════════════════════════════

  /**
   * Send a single file. Returns 'sent' | 'rejected'.
   * Uses async/await for the accept handshake, then runs the
   * chunk pipeline synchronously (zero microtask overhead per chunk).
   */
  const sendSingleFile = useCallback(async (file, fileIndex, totalFiles) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') {
      throw new Error('No open channel');
    }

    setTransferDirection('send');
    transferProgressRef.current = 0;
    setConnectionState(CONNECTION_STATES.TRANSFERRING);

    if (totalFiles > 1) {
      setMultiFileProgress({ current: fileIndex + 1, total: totalFiles, currentName: file.name });
    }

    dc.bufferedAmountLowThreshold = LOW_WATER;

    // 1) Send file metadata
    dc.send(JSON.stringify({
      type: MSG_TYPES.FILE_META,
      name: file.name,
      size: file.size,
      mime: file.type,
      fileIndex,
      totalFiles,
    }));

    addLogRef.current(`Awaiting acceptance for: ${file.name}...`, 'info');

    // 2) Await peer's accept/reject (clean async/await — no .then() nesting)
    const accepted = await waitForAcceptance();

    if (!accepted) {
      setConnectionState(CONNECTION_STATES.CONNECTED);
      return 'rejected';
    }

    // 3) Peer accepted — start the chunk pipeline SYNCHRONOUSLY
    addLogRef.current(`Sending: ${file.name}...`, 'info');

    return new Promise((resolve, reject) => {
      let offset = 0;
      let paused = false;
      let lastOffset = 0;
      let done = false;

      // Speed meter — writes to ref, rAF syncs to state
      clearSpeedInterval();
      speedIntervalRef.current = setInterval(() => {
        transferSpeedRef.current = offset - lastOffset; // ← ref, not setState
        lastOffset = offset;
      }, 1000);

      // Pre-read chunk queue
      const chunkQueue = [];
      const MAX_QUEUE = 8;
      let readOffset = 0;
      let reading = false;

      const readNextChunk = () => {
        if (reading || readOffset >= file.size || chunkQueue.length >= MAX_QUEUE) return;
        reading = true;

        const end = Math.min(readOffset + CHUNK_SIZE, file.size);
        const slice = file.slice(readOffset, end);
        const reader = new FileReader();

        reader.onload = () => {
          chunkQueue.push(reader.result);
          readOffset = end;
          reading = false;
          if (chunkQueue.length < MAX_QUEUE && readOffset < file.size) readNextChunk();
          if (!paused) sendChunks();
        };
        reader.onerror = () => { reading = false; reject(new Error('Read error')); };
        reader.readAsArrayBuffer(slice);
      };

      const sendChunks = () => {
        if (paused || done) return;

        // ── HOT LOOP: zero setState, zero React overhead ──
        while (chunkQueue.length > 0 && dc.bufferedAmount < HIGH_WATER) {
          if (dc.readyState !== 'open') {
            done = true;
            clearSpeedInterval();
            addLogRef.current('Channel closed during transfer!', 'error');
            setConnectionState(CONNECTION_STATES.ERROR);
            reject(new Error('Channel closed'));
            return;
          }

          const chunk = chunkQueue.shift();
          dc.send(chunk);
          offset += chunk.byteLength;
          readNextChunk();
        }

        // Update ref only — rAF syncs to React state
        transferProgressRef.current = Math.round((offset / file.size) * 100);

        if (offset >= file.size && chunkQueue.length === 0) {
          done = true;
          clearSpeedInterval();
          transferSpeedRef.current = 0;
          transferProgressRef.current = 100;
          addLogRef.current(`✓ Sent ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)!`, 'success');
          resolve('sent');
          return;
        }

        if (dc.bufferedAmount >= HIGH_WATER) {
          paused = true;
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            paused = false;
            sendChunks();
          };
        }
      };

      // Prime the read queue and start sending
      for (let i = 0; i < MAX_QUEUE; i++) readNextChunk();
      setTimeout(() => sendChunks(), 50);
    });
  }, [clearSpeedInterval]);

  // ── Send one or multiple files sequentially ──
  const sendFiles = useCallback(async (files) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    for (let i = 0; i < fileList.length; i++) {
      try {
        const result = await sendSingleFile(fileList[i], i, fileList.length);
        if (result === 'rejected' && fileList.length === 1) {
          setConnectionState(CONNECTION_STATES.CONNECTED);
          return;
        }
        if (i < fileList.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e) {
        addLogRef.current(`Failed to send ${fileList[i].name}: ${e.message}`, 'error');
        setConnectionState(CONNECTION_STATES.ERROR);
        return;
      }
    }

    setConnectionState(CONNECTION_STATES.COMPLETE);
    setMultiFileProgress(null);
  }, [sendSingleFile]);

  const sendFile = useCallback((file) => {
    sendFiles([file]);
  }, [sendFiles]);

  // ── Send text message ──
  const sendText = useCallback((text) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') {
      addLogRef.current('No open channel!', 'error');
      return;
    }

    dc.send(JSON.stringify({ type: MSG_TYPES.TEXT, text }));

    setTextMessages(prev => [...prev, {
      text,
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    }]);

    addLogRef.current(`Text sent: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`, 'info');
  }, []);

  const resetTransfer = useCallback(() => {
    transferProgressRef.current = 0;
    transferSpeedRef.current = 0;
    setReceivedFile(null);
    setIncomingFileInfo(null);
    setTransferDirection(null);
    setMultiFileProgress(null);
    if (connectionState === CONNECTION_STATES.COMPLETE) {
      setConnectionState(CONNECTION_STATES.CONNECTED);
    }
  }, [connectionState]);

  return {
    connectionState,
    transferProgress,
    transferSpeed,
    transferDirection,
    receivedFile,
    incomingFileInfo,
    pendingIncoming,
    textMessages,
    multiFileProgress,
    joinRoom,
    sendFile,
    sendFiles,
    sendText,
    acceptIncoming,
    rejectIncoming,
    resetTransfer,
    cleanup,
  };
}
