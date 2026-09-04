import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  DisconnectedModal,
  DisconnectedModalProps,
  formatRetryCountdown,
  formatAttemptBadge,
  calculateProgressPercent,
} from '../DisconnectedModal';

describe('DisconnectedModal', () => {
  describe('formatRetryCountdown', () => {
    it('returns "Connecting..." when isReconnecting is true', () => {
      expect(formatRetryCountdown(5, true)).toBe('Connecting...');
      expect(formatRetryCountdown(0, true)).toBe('Connecting...');
    });

    it('returns "Retrying in X seconds..." when isReconnecting is false', () => {
      expect(formatRetryCountdown(5, false)).toBe('Retrying in 5 seconds...');
      expect(formatRetryCountdown(4)).toBe('Retrying in 4 seconds...');
      expect(formatRetryCountdown(1)).toBe('Retrying in 1 seconds...');
      expect(formatRetryCountdown(0)).toBe('Retrying in 0 seconds...');
    });

    it('correctly models countdown tick-down step intervals from 5 to 0', () => {
      const countdownSteps = [5, 4, 3, 2, 1, 0];
      const expectedTexts = [
        'Retrying in 5 seconds...',
        'Retrying in 4 seconds...',
        'Retrying in 3 seconds...',
        'Retrying in 2 seconds...',
        'Retrying in 1 seconds...',
        'Retrying in 0 seconds...',
      ];

      const actualTexts = countdownSteps.map((sec) => formatRetryCountdown(sec));
      expect(actualTexts).toEqual(expectedTexts);
    });
  });

  describe('formatAttemptBadge', () => {
    it('formats attempt count with default 1', () => {
      expect(formatAttemptBadge()).toBe('Attempt #1');
    });

    it('formats custom attempt counts', () => {
      expect(formatAttemptBadge(1)).toBe('Attempt #1');
      expect(formatAttemptBadge(2)).toBe('Attempt #2');
      expect(formatAttemptBadge(10)).toBe('Attempt #10');
      expect(formatAttemptBadge(99)).toBe('Attempt #99');
    });
  });

  describe('calculateProgressPercent', () => {
    it('calculates percentage out of 5 seconds properly', () => {
      expect(calculateProgressPercent(5, 5)).toBe(100);
      expect(calculateProgressPercent(4, 5)).toBe(80);
      expect(calculateProgressPercent(3, 5)).toBe(60);
      expect(calculateProgressPercent(2, 5)).toBe(40);
      expect(calculateProgressPercent(1, 5)).toBe(20);
      expect(calculateProgressPercent(0, 5)).toBe(0);
    });

    it('clamps negative values or values exceeding total seconds', () => {
      expect(calculateProgressPercent(-2, 5)).toBe(0);
      expect(calculateProgressPercent(10, 5)).toBe(100);
    });

    it('handles totalSeconds <= 0 safely', () => {
      expect(calculateProgressPercent(5, 0)).toBe(0);
    });
  });

  describe('Component Rendering', () => {
    it('renders null when show is false', () => {
      const onRetryMock = jest.fn();
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(DisconnectedModal, {
          show: false,
          onRetry: onRetryMock,
        })
      );
      expect(markup).toBe('');
    });

    it('renders modal with default props when show is true', () => {
      const onRetryMock = jest.fn();
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(DisconnectedModal, {
          show: true,
          onRetry: onRetryMock,
        })
      );

      // Title and Subtitle
      expect(markup).toContain('Connection Lost to Backend Server');
      expect(markup).toContain(
        'The WebSocket connection to the Node.js backend has dropped. The application will automatically attempt to reconnect every 5 seconds.'
      );

      // Warning Icon
      expect(markup).toContain('⚡');

      // Default countdown and attempt badge
      expect(markup).toContain('Retrying in 5 seconds...');
      expect(markup).toContain('Attempt #1');

      // Default backend URL
      expect(markup).toContain('WebSocket Server');

      // Action button
      expect(markup).toContain('🔄 Retry Now');

      // Troubleshooting hint
      expect(markup).toContain(
        'Ensure the backend server process is active. Once reconnected, this dialog will dismiss automatically and your session will resume.'
      );

      // Theme colors applied
      expect(markup).toContain('#1e2227');
      expect(markup).toContain('#282c34');
      expect(markup).toContain('#abb2bf');
      expect(markup).toContain('#e06c75');
      expect(markup).toContain('#61afef');

      // Progress bar reflects 5 out of 5 (100%)
      expect(markup).toContain('aria-valuenow="5"');
      expect(markup).toContain('width:100%');
    });

    it('renders with custom props (countdown, attempt count, backendUrl, reconnecting)', () => {
      const onRetryMock = jest.fn();
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(DisconnectedModal, {
          show: true,
          onRetry: onRetryMock,
          attemptCount: 4,
          nextRetrySeconds: 2,
          isReconnecting: false,
          backendUrl: 'ws://127.0.0.1:8080/rcon',
        })
      );

      expect(markup).toContain('Attempt #4');
      expect(markup).toContain('Retrying in 2 seconds...');
      expect(markup).toContain('ws://127.0.0.1:8080/rcon');
      expect(markup).toContain('aria-valuenow="2"');
      expect(markup).toContain('width:40%');
    });

    it('renders "Connecting..." and blue progress bar when isReconnecting is true', () => {
      const onRetryMock = jest.fn();
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(DisconnectedModal, {
          show: true,
          onRetry: onRetryMock,
          attemptCount: 3,
          nextRetrySeconds: 0,
          isReconnecting: true,
          backendUrl: 'ws://localhost:3000',
        })
      );

      expect(markup).toContain('Connecting...');
      expect(markup).not.toContain('Retrying in');
      expect(markup).toContain('Attempt #3');
      expect(markup).toContain('ws://localhost:3000');
    });

    it('preserves onRetry callback handler on the retry button', () => {
      const onRetryMock = jest.fn();
      const element = React.createElement(DisconnectedModal, {
        show: true,
        onRetry: onRetryMock,
      });

      // Directly render component instance
      const rendered = DisconnectedModal(element.props as DisconnectedModalProps);
      expect(rendered).not.toBeNull();

      // Traverse children to find the button
      const findButton = (node: any): any => {
        if (!node || typeof node !== 'object') return null;
        if (node.props?.['data-testid'] === 'retry-button') {
          return node;
        }
        if (Array.isArray(node.props?.children)) {
          for (const child of node.props.children) {
            const found = findButton(child);
            if (found) return found;
          }
        } else if (node.props?.children) {
          return findButton(node.props.children);
        }
        return null;
      };

      const button = findButton(rendered);
      expect(button).toBeDefined();
      expect(button.props.onClick).toBe(onRetryMock);
      button.props.onClick();
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });
  });
});
