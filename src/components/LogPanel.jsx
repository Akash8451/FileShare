import { useRef, useEffect } from 'react';
import './LogPanel.css';

export default function LogPanel({ logs }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="log-panel glass-card animate-slide-up">
      <div className="log-panel__header">
        <div className="log-panel__icon-circle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <h3 className="log-panel__title">System Logs</h3>
        <span className="log-panel__count">{logs.length}</span>
      </div>

      <div className="log-panel__scroll" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="log-panel__empty">Waiting for activity...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`log-panel__entry log-panel__entry--${log.type}`}>
              <span className="log-panel__time">{log.time}</span>
              <span className="log-panel__message">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
