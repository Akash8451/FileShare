import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useWebRTC, CONNECTION_STATES } from './hooks/useWebRTC';
import { useTransferHistory } from './hooks/useTransferHistory';
import RoomPanel from './components/RoomPanel';
import DropZone from './components/DropZone';
import TransferPanel from './components/TransferPanel';
import TextSharePanel from './components/TextSharePanel';
import LogPanel from './components/LogPanel';
import HistoryPanel from './components/HistoryPanel';
import StatusIndicator from './components/StatusIndicator';
import AcceptDialog from './components/AcceptDialog';
import './App.css';

export default function App() {
  const [logs, setLogs] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const addLog = useCallback((message, type = 'info') => {
    const time = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs((prev) => [...prev, { message, type, time }]);
  }, []);

  const { socket, isConnected } = useSocket();
  const { history, addTransfer, clearHistory } = useTransferHistory();

  const {
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
    sendFiles,
    sendText,
    acceptIncoming,
    rejectIncoming,
    resetTransfer,
  } = useWebRTC(socket, addLog);

  // Handle ?room= query param for QR code deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode && isConnected) {
      joinRoom(roomCode.toUpperCase());
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isConnected, joinRoom]);

  // Save completed transfers to history
  useEffect(() => {
    if (connectionState === CONNECTION_STATES.COMPLETE) {
      if (receivedFile) {
        addTransfer({
          name: receivedFile.name,
          size: receivedFile.size,
          direction: 'receive',
          url: receivedFile.url,
        });
      } else if (incomingFileInfo) {
        // Sender side complete
        addTransfer({
          name: incomingFileInfo.name || 'file',
          size: incomingFileInfo.size || 0,
          direction: 'send',
        });
      }
    }
  }, [connectionState, receivedFile, incomingFileInfo, addTransfer]);

  const handleSendFiles = useCallback(() => {
    if (selectedFiles.length > 0) {
      sendFiles(selectedFiles);
    }
  }, [selectedFiles, sendFiles]);

  const handleReset = useCallback(() => {
    setSelectedFiles([]);
    resetTransfer();
  }, [resetTransfer]);

  const isConnectedToPeer = [
    CONNECTION_STATES.CONNECTED,
    CONNECTION_STATES.TRANSFERRING,
    CONNECTION_STATES.COMPLETE,
  ].includes(connectionState);

  return (
    <div className="app">
      {/* Ambient glow orbs */}
      <div className="app__orb app__orb--1" />
      <div className="app__orb app__orb--2" />

      {/* Accept/Reject dialog */}
      <AcceptDialog
        fileInfo={pendingIncoming}
        onAccept={acceptIncoming}
        onReject={rejectIncoming}
      />

      <div className="app__container">
        {/* Header */}
        <header className="app__header animate-fade-in">
          <div className="app__logo-group">
            <div className="app__logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#logoGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <defs>
                  <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6c5ce7" />
                    <stop offset="100%" stopColor="#a29bfe" />
                  </linearGradient>
                </defs>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div>
              <h1 className="app__title">FileShare</h1>
              <p className="app__tagline">Peer-to-peer • No cloud • No limits</p>
            </div>
          </div>
          <StatusIndicator connectionState={connectionState} />
        </header>

        {/* Main content */}
        <main className="app__main stagger-children">
          <RoomPanel
            connectionState={connectionState}
            onJoinRoom={joinRoom}
          />

          <div className="app__transfer-section">
            <DropZone
              onFilesSelected={setSelectedFiles}
              disabled={!isConnectedToPeer || connectionState === CONNECTION_STATES.TRANSFERRING}
            />

            <TransferPanel
              connectionState={connectionState}
              transferProgress={transferProgress}
              transferSpeed={transferSpeed}
              transferDirection={transferDirection}
              receivedFile={receivedFile}
              selectedFiles={selectedFiles}
              onSendFiles={handleSendFiles}
              onReset={handleReset}
              multiFileProgress={multiFileProgress}
            />
          </div>

          {/* Text Sharing */}
          <TextSharePanel
            isConnected={isConnectedToPeer}
            onSendText={sendText}
            messages={textMessages}
          />

          {/* Transfer History */}
          <HistoryPanel
            history={history}
            onClear={clearHistory}
          />

          <LogPanel logs={logs} />
        </main>

        {/* Footer */}
        <footer className="app__footer animate-fade-in">
          <p>End-to-end encrypted via WebRTC • Files never leave your devices</p>
        </footer>
      </div>
    </div>
  );
}
