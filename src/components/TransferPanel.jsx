import { CONNECTION_STATES } from '../hooks/useWebRTC';
import { formatBytes } from '../utils/helpers';
import './TransferPanel.css';

export default function TransferPanel({
  connectionState,
  transferDirection,
  receivedFile,
}) {
  const isConnected = [
    CONNECTION_STATES.CONNECTED,
    CONNECTION_STATES.TRANSFERRING,
    CONNECTION_STATES.COMPLETE,
  ].includes(connectionState);

  const isTransferring = connectionState === CONNECTION_STATES.TRANSFERRING;
  const isComplete = connectionState === CONNECTION_STATES.COMPLETE;
  const directionLabel = transferDirection === 'send' ? 'Sending' : 'Receiving';

  return (
    <div className={`transfer-panel glass-card animate-slide-up ${!isConnected ? 'transfer-panel--disabled' : ''}`}>
      <div className="transfer-panel__header">
        <div className="transfer-panel__icon-circle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div>
          <h2 className="transfer-panel__title">Transfer</h2>
          <p className="transfer-panel__subtitle">
            {!isConnected ? 'Connect to a peer first' : 'Select files above to send'}
          </p>
        </div>
      </div>



      {/* Basic Status display instead of progress bar */}
      {(isTransferring || isComplete) && (
        <div className="transfer-panel__progress animate-fade-in" style={{ padding: 'var(--space-md) 0' }}>
          <div className="transfer-panel__progress-header" style={{ justifyContent: 'center' }}>
            <span className="transfer-panel__progress-label" style={{ fontSize: 'var(--font-lg)' }}>
              {isComplete ? '✓ Complete' : `${directionLabel}...`}
            </span>
          </div>
        </div>
      )}

      {/* Received file download */}
      {isComplete && receivedFile && (
        <div className="transfer-panel__received animate-fade-in">
          <a
            href={receivedFile.url}
            download={receivedFile.name}
            className="btn btn-success transfer-panel__download-btn"
            id="download-btn"
          >
            💾 Download {receivedFile.name}
          </a>
          <span className="transfer-panel__file-size">{formatBytes(receivedFile.size)}</span>

          {receivedFile.mime?.startsWith('image/') && (
            <img
              src={receivedFile.url}
              alt="Received file preview"
              className="transfer-panel__preview-image"
            />
          )}
        </div>
      )}
    </div>
  );
}
