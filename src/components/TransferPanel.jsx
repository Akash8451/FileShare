import { CONNECTION_STATES } from '../hooks/useWebRTC';
import { formatSpeed, formatBytes } from '../utils/helpers';
import './TransferPanel.css';

export default function TransferPanel({
  connectionState,
  transferProgress,
  transferSpeed,
  transferDirection,
  receivedFile,
  onSendFiles,
  selectedFiles,
  onReset,
  multiFileProgress,
}) {
  const isConnected = [
    CONNECTION_STATES.CONNECTED,
    CONNECTION_STATES.TRANSFERRING,
    CONNECTION_STATES.COMPLETE,
  ].includes(connectionState);

  const isTransferring = connectionState === CONNECTION_STATES.TRANSFERRING;
  const isComplete = connectionState === CONNECTION_STATES.COMPLETE;
  const canSend = connectionState === CONNECTION_STATES.CONNECTED && selectedFiles && selectedFiles.length > 0;

  const directionLabel = transferDirection === 'send' ? 'Sending' : 'Receiving';
  const directionPrefix = transferDirection === 'send' ? 'Tx' : 'Rx';

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
            {!isConnected ? 'Connect to a peer first' : 'Select files and send'}
          </p>
        </div>
      </div>

      {/* Multi-file indicator */}
      {multiFileProgress && (isTransferring || isComplete) && (
        <div className="transfer-panel__multi-badge animate-fade-in">
          File {multiFileProgress.current} of {multiFileProgress.total}
          {multiFileProgress.currentName && (
            <span className="transfer-panel__multi-name"> — {multiFileProgress.currentName}</span>
          )}
        </div>
      )}

      {/* Progress Bar */}
      {(isTransferring || isComplete) && (
        <div className="transfer-panel__progress animate-fade-in">
          <div className="transfer-panel__progress-header">
            <span className="transfer-panel__progress-label">
              {isComplete ? '✓ Complete' : `${directionLabel}...`}
            </span>
            <span className="transfer-panel__progress-pct">{transferProgress}%</span>
          </div>

          <div className="transfer-panel__progress-track">
            <div
              className={`transfer-panel__progress-fill ${isComplete ? 'transfer-panel__progress-fill--complete' : ''}`}
              style={{ width: `${transferProgress}%` }}
            />
          </div>

          <div className="transfer-panel__speed-row">
            <span className="transfer-panel__speed-label">{directionPrefix} Speed</span>
            <span className="transfer-panel__speed-value">
              {isTransferring ? formatSpeed(transferSpeed) : '—'}
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

      {/* Send button */}
      {isConnected && !isTransferring && (
        <div className="transfer-panel__actions">
          {isComplete && (
            <button className="btn btn-ghost w-full" onClick={onReset} id="reset-btn">
              Send another file
            </button>
          )}
          {!isComplete && (
            <button
              className="btn btn-primary w-full"
              onClick={onSendFiles}
              disabled={!canSend}
              id="send-file-btn"
            >
              {canSend
                ? selectedFiles.length === 1
                  ? `Send ${selectedFiles[0].name}`
                  : `Send ${selectedFiles.length} files`
                : 'Select files first'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
