import { useState, useRef, useEffect } from 'react';
import { HiOutlinePaperAirplane, HiOutlineClipboard } from 'react-icons/hi2';
import './TextSharePanel.css';

export default function TextSharePanel({ isConnected, onSendText, messages }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !isConnected) return;
    onSendText(trimmed);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        onSendText(clipText);
      }
    } catch {
      // Clipboard API not available
    }
  };

  const copyMessage = async (msg) => {
    try {
      await navigator.clipboard.writeText(msg);
    } catch {}
  };

  return (
    <div className={`text-panel glass-card animate-slide-up ${!isConnected ? 'text-panel--disabled' : ''}`}>
      <div className="text-panel__header">
        <div className="text-panel__icon-circle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-panel__title">Quick Text</h3>
          <p className="text-panel__subtitle">Share text snippets & clipboard</p>
        </div>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="text-panel__messages" ref={scrollRef}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`text-panel__msg text-panel__msg--${msg.from}`}
              onClick={() => copyMessage(msg.text)}
              title="Click to copy"
            >
              <span className="text-panel__msg-text">{msg.text}</span>
              <span className="text-panel__msg-time">{msg.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="text-panel__input-row">
        <button
          className="btn btn-ghost text-panel__paste-btn"
          onClick={handlePasteClipboard}
          disabled={!isConnected}
          title="Paste & send clipboard"
          id="paste-clipboard-btn"
        >
          <HiOutlineClipboard size={16} />
        </button>
        <textarea
          className="input text-panel__textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={!isConnected}
          id="text-message-input"
        />
        <button
          className="btn btn-primary text-panel__send-btn"
          onClick={handleSend}
          disabled={!text.trim() || !isConnected}
          id="send-text-btn"
        >
          <HiOutlinePaperAirplane size={16} />
        </button>
      </div>
    </div>
  );
}
