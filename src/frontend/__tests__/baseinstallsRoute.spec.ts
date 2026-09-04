import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { InstallManager } from '../InstallManager';
import { SteamCmdManager } from '../SteamCmdManager';
import { TabErrorBoundary } from '../TabErrorBoundary';

class MockWebSocket {
  readyState: number;
  listeners: Record<string, ((...args: any[]) => void)[]> = {};
  sent: string[] = [];

  constructor(readyState: number = 0) {
    this.readyState = readyState;
  }

  addEventListener(event: string, fn: (...args: any[]) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event: string, fn: (...args: any[]) => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((l) => l !== fn);
  }

  send(data: string) {
    if (this.readyState !== 1) {
      throw new Error(`Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.`);
    }
    this.sent.push(data);
  }

  open() {
    this.readyState = 1;
    (this.listeners['open'] || []).forEach((fn) => fn());
  }

  emitMessage(data: any) {
    (this.listeners['message'] || []).forEach((fn) =>
      fn({ data: JSON.stringify(data) })
    );
  }
}

describe('Base Installs Route & WebSocket Readiness', () => {
  describe('InstallManager & SteamCmdManager WebSocket safety', () => {
    it('renders InstallManager without crashing when WebSocket is in CONNECTING state (readyState 0)', () => {
      const mockWs = new MockWebSocket(0);
      expect(() => {
        ReactDOMServer.renderToString(
          React.createElement(InstallManager, {
            ws: mockWs as any,
            handleUpdateBaseInstallFiles: jest.fn(),
            active: true,
          })
        );
      }).not.toThrow();
    });

    it('renders SteamCmdManager without crashing when WebSocket is in CONNECTING state (readyState 0)', () => {
      const mockWs = new MockWebSocket(0);
      expect(() => {
        ReactDOMServer.renderToString(
          React.createElement(SteamCmdManager, {
            ws: mockWs as any,
          })
        );
      }).not.toThrow();
    });

    it('renders InstallManager safely when ws is null', () => {
      expect(() => {
        ReactDOMServer.renderToString(
          React.createElement(InstallManager, {
            ws: null,
            handleUpdateBaseInstallFiles: jest.fn(),
            active: true,
          })
        );
      }).not.toThrow();
    });

    it('renders SteamCmdManager safely when ws is null', () => {
      expect(() => {
        ReactDOMServer.renderToString(
          React.createElement(SteamCmdManager, {
            ws: null,
          })
        );
      }).not.toThrow();
    });
  });

  describe('TabErrorBoundary', () => {
    it('renders children when no error occurs', () => {
      const markup = ReactDOMServer.renderToString(
        React.createElement(
          TabErrorBoundary,
          { tabName: 'baseinstalls' },
          React.createElement('div', null, 'Base Installs Content')
        )
      );
      expect(markup).toContain('Base Installs Content');
    });

    it('renders fallback error message with Retry button when an error is caught', () => {
      const boundary = new TabErrorBoundary({ tabName: 'baseinstalls', children: null });
      boundary.state = {
        hasError: true,
        error: new Error('Simulated baseinstalls crash'),
      };

      const rendered = boundary.render() as React.ReactElement;
      const markup = ReactDOMServer.renderToString(rendered);
      expect(markup).toContain('Something went wrong displaying');
      expect(markup).toContain('baseinstalls');
      expect(markup).toContain('Simulated baseinstalls crash');
      expect(markup).toContain('Retry Tab');
    });
  });
});
