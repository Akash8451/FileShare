import { useState } from 'react';
import { HiOutlineArrowPath } from 'react-icons/hi2';
import { generateRoomCode } from '../utils/helpers';
import { CONNECTION_STATES } from '../hooks/useWebRTC';
import './RoomPanel.css';

export default function RoomPanel({ connectionState, onJoinRoom }) {
  const [roomCode, setRoomCode] = useState('');

  const isInRoom = connectionState !== CONNECTION_STATES.IDLE;
  const activeCode = roomCode.toUpperCase();

  const handleCreate = () => {
    const code = generateRoomCode();
    setRoomCode(code);
    onJoinRoom(code);
  };

  const handleJoin = () => {
    if (activeCode.length >= 4) {
      onJoinRoom(activeCode);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleJoin();
  };

  return (
    <div className="room-panel glass-card animate-slide-up">
      <div className="room-panel__header">
        <div className="room-panel__icon-circle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <h2 className="room-panel__title">Connect</h2>
          <p className="room-panel__subtitle">Create or join a room to start sharing</p>
        </div>
      </div>

      {!isInRoom ? (
        <div className="room-panel__actions">
          <button className="btn btn-primary room-panel__create-btn" onClick={handleCreate} id="create-room-btn">
            <HiOutlineArrowPath size={16} />
            Create Room
          </button>

          <div className="room-panel__divider">
            <span>or join existing</span>
          </div>

          <div className="room-panel__join-row">
            <input
              className="input room-panel__input"
              type="text"
              placeholder="Enter room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              maxLength={6}
              id="room-code-input"
            />
            <button
              className="btn btn-ghost"
              onClick={handleJoin}
              disabled={activeCode.length < 4}
              id="join-room-btn"
            >
              Join
            </button>
          </div>
        </div>
      ) : (
        <div className="room-panel__connected animate-fade-in">
          <div className="room-panel__code-display">
            <span className="room-panel__code-label">Room Code</span>
            <span className="room-panel__code-value">{activeCode}</span>
          </div>

        </div>
      )}
    </div>
  );
}
