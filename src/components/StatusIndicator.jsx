import { CONNECTION_STATES } from '../hooks/useWebRTC';
import './StatusIndicator.css';

const STATE_CONFIG = {
  [CONNECTION_STATES.IDLE]: { label: 'Ready', color: 'muted', pulse: false },
  [CONNECTION_STATES.JOINING]: { label: 'Joining...', color: 'info', pulse: true },
  [CONNECTION_STATES.WAITING]: { label: 'Waiting for peer', color: 'warning', pulse: true },
  [CONNECTION_STATES.CONNECTING]: { label: 'Establishing tunnel', color: 'info', pulse: true },
  [CONNECTION_STATES.CONNECTED]: { label: 'Connected', color: 'success', pulse: false },
  [CONNECTION_STATES.TRANSFERRING]: { label: 'Transferring', color: 'accent', pulse: true },
  [CONNECTION_STATES.COMPLETE]: { label: 'Complete', color: 'success', pulse: false },
  [CONNECTION_STATES.ERROR]: { label: 'Error', color: 'error', pulse: false },
  [CONNECTION_STATES.DISCONNECTED]: { label: 'Disconnected', color: 'error', pulse: false },
  [CONNECTION_STATES.RECONNECTING]: { label: 'Reconnecting...', color: 'warning', pulse: true },
};

export default function StatusIndicator({ connectionState }) {
  const config = STATE_CONFIG[connectionState] || STATE_CONFIG[CONNECTION_STATES.IDLE];

  return (
    <div className="status-indicator" id="connection-status">
      <span className={`status-indicator__dot status-indicator__dot--${config.color} ${config.pulse ? 'status-indicator__dot--pulse' : ''}`} />
      <span className="status-indicator__label">{config.label}</span>
    </div>
  );
}
