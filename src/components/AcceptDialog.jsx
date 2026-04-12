import { formatBytes } from '../utils/helpers';
import './AcceptDialog.css';

export default function AcceptDialog({ fileInfo, onAccept, onReject }) {
  if (!fileInfo) return null;

  const isMulti = fileInfo.totalFiles > 1;

  return (
    <div className="accept-overlay" id="accept-dialog-overlay">
      <div className="accept-dialog glass-card animate-slide-up">
        <div className="accept-dialog__icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>

        <h3 className="accept-dialog__title">Incoming File</h3>

        {isMulti && (
          <span className="accept-dialog__badge">
            File {fileInfo.fileIndex + 1} of {fileInfo.totalFiles}
          </span>
        )}

        <div className="accept-dialog__file-info">
          <span className="accept-dialog__filename">{fileInfo.name}</span>
          <span className="accept-dialog__filesize">{formatBytes(fileInfo.size)}</span>
        </div>

        <div className="accept-dialog__actions">
          <button
            className="btn btn-ghost accept-dialog__reject"
            onClick={onReject}
            id="reject-file-btn"
          >
            Decline
          </button>
          <button
            className="btn btn-success accept-dialog__accept"
            onClick={onAccept}
            id="accept-file-btn"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
