import { formatBytes } from '../utils/helpers';
import { HiOutlineTrash, HiOutlineClock } from 'react-icons/hi2';
import './HistoryPanel.css';

export default function HistoryPanel({ history, onClear }) {
  if (history.length === 0) return null;

  const formatTime = (timestamp) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="history-panel glass-card animate-slide-up">
      <div className="history-panel__header">
        <div className="history-panel__header-left">
          <HiOutlineClock size={16} className="history-panel__icon" />
          <h3 className="history-panel__title">Transfer History</h3>
          <span className="history-panel__count">{history.length}</span>
        </div>
        <button
          className="btn btn-ghost history-panel__clear-btn"
          onClick={onClear}
          id="clear-history-btn"
        >
          <HiOutlineTrash size={14} />
        </button>
      </div>

      <div className="history-panel__list">
        {history.map((item) => (
          <div key={item.id} className="history-panel__item">
            <span className="history-panel__item-direction">
              {item.direction === 'send' ? '↑' : '↓'}
            </span>
            <div className="history-panel__item-details">
              <span className="history-panel__item-name">{item.name}</span>
              <span className="history-panel__item-meta">
                {formatBytes(item.size)} • {formatTime(item.timestamp)}
              </span>
            </div>
            {item.url && (
              <a
                href={item.url}
                download={item.name}
                className="history-panel__item-download"
                title="Download"
              >
                💾
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
