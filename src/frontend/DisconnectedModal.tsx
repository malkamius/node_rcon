import React from 'react';

export interface DisconnectedModalProps {
  show: boolean;
  onRetry: () => void;
  attemptCount?: number;
  nextRetrySeconds?: number;
  isReconnecting?: boolean;
  backendUrl?: string;
}

export function formatRetryCountdown(nextRetrySeconds: number, isReconnecting: boolean = false): string {
  if (isReconnecting) {
    return 'Connecting...';
  }
  return `Retrying in ${nextRetrySeconds} seconds...`;
}

export function formatAttemptBadge(attemptCount: number = 1): string {
  return `Attempt #${attemptCount}`;
}

export function calculateProgressPercent(nextRetrySeconds: number, totalSeconds: number = 5): number {
  if (totalSeconds <= 0) return 0;
  const clamped = Math.max(0, Math.min(totalSeconds, nextRetrySeconds));
  return Math.round((clamped / totalSeconds) * 100);
}

export const DisconnectedModal: React.FC<DisconnectedModalProps> = ({
  show,
  onRetry,
  attemptCount = 1,
  nextRetrySeconds = 5,
  isReconnecting = false,
  backendUrl,
}) => {
  if (!show) return null;

  const tickerText = formatRetryCountdown(nextRetrySeconds, isReconnecting);
  const attemptText = formatAttemptBadge(attemptCount);
  const progressPercent = calculateProgressPercent(nextRetrySeconds, 5);
  const resolvedBackendUrl = backendUrl || 'WebSocket Server';

  return (
    <div
      data-testid="disconnected-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(30, 34, 39, 0.85)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <style>{`
        @keyframes pulseWarningGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(224, 108, 117, 0.7);
            transform: scale(1);
          }
          70% {
            box-shadow: 0 0 0 14px rgba(224, 108, 117, 0);
            transform: scale(1.05);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(224, 108, 117, 0);
            transform: scale(1);
          }
        }
      `}</style>
      <div
        data-testid="disconnected-modal-container"
        style={{
          background: '#282c34',
          color: '#abb2bf',
          padding: '2rem 2.5rem',
          borderRadius: 10,
          border: '1px solid rgba(224, 108, 117, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(224, 108, 117, 0.15)',
          textAlign: 'center',
          maxWidth: 480,
          width: '90%',
          boxSizing: 'border-box',
        }}
      >
        {/* Warning Icon with animated pulsing glow */}
        <div
          data-testid="disconnected-modal-icon"
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'rgba(224, 108, 117, 0.15)',
            border: '2px solid #e06c75',
            color: '#e06c75',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem auto',
            fontSize: 28,
            animation: 'pulseWarningGlow 2s infinite',
          }}
        >
          ⚡
        </div>

        {/* Title */}
        <h2
          data-testid="disconnected-modal-title"
          style={{
            color: '#ffffff',
            margin: '0 0 0.5rem 0',
            fontSize: '1.35rem',
            fontWeight: 600,
          }}
        >
          Connection Lost to Backend Server
        </h2>

        {/* Subtitle */}
        <p
          data-testid="disconnected-modal-subtitle"
          style={{
            margin: '0 0 1.5rem 0',
            fontSize: '0.88rem',
            lineHeight: 1.45,
            color: '#abb2bf',
          }}
        >
          The WebSocket connection to the Node.js backend has dropped. The application will automatically attempt to reconnect every 5 seconds.
        </p>

        {/* Live Status Card */}
        <div
          data-testid="disconnected-status-card"
          style={{
            background: '#1e2227',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span
              data-testid="countdown-ticker"
              style={{
                fontWeight: 600,
                fontSize: '0.9rem',
                color: isReconnecting ? '#61afef' : '#abb2bf',
              }}
            >
              {tickerText}
            </span>
            <span
              data-testid="attempt-badge"
              style={{
                background: 'rgba(97, 175, 239, 0.15)',
                color: '#61afef',
                border: '1px solid rgba(97, 175, 239, 0.35)',
                borderRadius: 12,
                padding: '0.2rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              {attemptText}
            </span>
          </div>

          {/* Animated Progress Bar */}
          <div
            role="progressbar"
            aria-valuenow={nextRetrySeconds}
            aria-valuemin={0}
            aria-valuemax={5}
            data-testid="progress-bar-track"
            style={{
              background: '#282c34',
              borderRadius: 4,
              height: 6,
              overflow: 'hidden',
              marginBottom: '0.75rem',
            }}
          >
            <div
              data-testid="progress-bar-fill"
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: isReconnecting ? '#61afef' : '#e06c75',
                transition: 'width 0.3s ease-in-out',
                borderRadius: 4,
              }}
            />
          </div>

          {/* Backend URL Display */}
          <div
            data-testid="backend-url-display"
            style={{
              fontSize: '0.78rem',
              color: '#abb2bf',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span style={{ opacity: 0.7 }}>Target:</span>
            <code
              style={{
                color: '#61afef',
                background: 'rgba(97, 175, 239, 0.08)',
                padding: '0.15rem 0.4rem',
                borderRadius: 4,
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              }}
            >
              {resolvedBackendUrl}
            </code>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          data-testid="retry-button"
          onClick={onRetry}
          style={{
            background: '#61afef',
            color: '#1e2227',
            border: 'none',
            borderRadius: 6,
            padding: '0.65rem 1.5rem',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: 'pointer',
            width: '100%',
            marginBottom: '1rem',
            transition: 'background 0.2s',
          }}
        >
          🔄 Retry Now
        </button>

        {/* Troubleshooting Hint */}
        <p
          data-testid="troubleshooting-hint"
          style={{
            margin: 0,
            fontSize: '0.75rem',
            lineHeight: 1.4,
            color: '#abb2bf',
            opacity: 0.8,
          }}
        >
          Ensure the backend server process is active. Once reconnected, this dialog will dismiss automatically and your session will resume.
        </p>
      </div>
    </div>
  );
};
