import { useState, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import { useWebRTC, CONNECTION_STATES } from './hooks/useWebRTC';
import RoomPanel from './components/RoomPanel';

import TransferPanel from './components/TransferPanel';
import StatusIndicator from './components/StatusIndicator';
import AcceptDialog from './components/AcceptDialog';
import './App.css';

export default function App() {

  const { socket, isConnected } = useSocket();

  const {
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
  } = useWebRTC(socket);



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
            <div className="app__file-input-wrapper">
              <input
                type="file"
                onChange={(e) => {
                  if (e.target.files.length > 0) {
                    sendFile(e.target.files[0]);
                  }
                }}
                disabled={!isConnectedToPeer || connectionState === CONNECTION_STATES.TRANSFERRING}
                className="app__file-input"
              />
            </div>

            <TransferPanel
              connectionState={connectionState}
              transferDirection={transferDirection}
              receivedFile={receivedFile}
            />
          </div>
        </main>

        {/* Footer */}
        <footer className="app__footer animate-fade-in">
          <p>End-to-end encrypted via WebRTC • Files never leave your devices</p>
        </footer>
      </div>
    </div>
  );
}
