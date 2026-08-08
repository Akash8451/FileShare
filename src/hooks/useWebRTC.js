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
};

export function useWebRTC(socket) {
  // ── Peer connection refs ──
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const speedIntervalRef = useRef(null);
  const roomCodeRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const isInitiatorRef = useRef(false);

  // ── React state (UI-facing, updated via rAF) ──
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.IDLE);
  const [transferDirection, setTransferDirection] = useState(null);
  const [receivedFile, setReceivedFile] = useState(null);
  const [incomingFileInfo, setIncomingFileInfo] = useState(null);
  const [pendingIncoming, setPendingIncoming] = useState(null);
  const [iceConfig, setIceConfig] = useState(null);

  // ── Receiver state (all refs — zero re-render overhead) ──
  const receiveBufferRef = useRef([]);
  const receivedSizeRef = useRef(0);
  const fileMetaRef = useRef(null);

  // ── Accept/reject async coordination ──
  const pendingAcceptResolveRef = useRef(null);

  // ── Console logger ──
  const addLogRef = useRef((msg, type) => console.log(`[${type}] ${msg}`));



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



  const cleanup = useCallback(() => {
    if (dcRef.current) {
      try { dcRef.current.close(); } catch {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
  }, []);

  // ── Data channel message handler (stable via ref bridge) ──
  const handleControlMessage = useCallback((msg) => {
    switch (msg.type) {
      case MSG_TYPES.FILE_META:
        setPendingIncoming({
          name: msg.name,
          size: msg.size,
          mime: msg.mime,
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
          if (receivedSizeRef.current >= meta.size) {
            addLogRef.current('Reassembling file...', 'info');
            const blob = new Blob(receiveBufferRef.current, { type: meta.mime });
            receiveBufferRef.current = [];

            const url = URL.createObjectURL(blob);
            setReceivedFile({ url, name: meta.name, mime: meta.mime, size: meta.size });
            setConnectionState(CONNECTION_STATES.COMPLETE);
            addLogRef.current(`✓ Received ${meta.name}!`, 'success');
          }
        }
      }
    };
  }, []); // ← stable: no handleControlMessage dep

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
  }, [socket, iceConfig, setupDataChannelListeners, attemptReconnect]);

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
      setReceivedFile(null);
      setIncomingFileInfo(null);
      setTransferDirection(null);
      setPendingIncoming(null);
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
    setTransferDirection('receive');
    setConnectionState(CONNECTION_STATES.TRANSFERRING);
    setIncomingFileInfo(pending);
    setPendingIncoming(null);


  }, [pendingIncoming]);

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
  const sendFile = useCallback(async (file) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') {
      throw new Error('No open channel');
    }

    setTransferDirection('send');
    setConnectionState(CONNECTION_STATES.TRANSFERRING);

    dc.bufferedAmountLowThreshold = LOW_WATER;

    // 1) Send file metadata
    dc.send(JSON.stringify({
      type: MSG_TYPES.FILE_META,
      name: file.name,
      size: file.size,
      mime: file.type,
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



        if (offset >= file.size && chunkQueue.length === 0) {
          done = true;
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
  }, []);



  const resetTransfer = useCallback(() => {
    setReceivedFile(null);
    setIncomingFileInfo(null);
    setTransferDirection(null);
    if (connectionState === CONNECTION_STATES.COMPLETE) {
      setConnectionState(CONNECTION_STATES.CONNECTED);
    }
  }, [connectionState]);

  return {
    connectionState,
    transferDirection,
    receivedFile,
    incomingFileInfo,
    pendingIncoming,
    joinRoom,
    sendFile,
    acceptIncoming,
    rejectIncoming,
    resetTransfer,
    cleanup,
  };
}
