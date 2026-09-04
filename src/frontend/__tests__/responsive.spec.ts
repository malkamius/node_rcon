import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  isMobileViewport,
  getTerminalFontSize,
  MOBILE_BREAKPOINT,
} from '../responsiveUtils';
import { TabManager } from '../TabManager';
import { ServerConfigTab } from '../ServerConfigTab';

describe('Responsive UI & Mobile Screen Optimization', () => {
  describe('Viewport Breakpoint Classification', () => {
    it('defines MOBILE_BREAKPOINT as 768px', () => {
      expect(MOBILE_BREAKPOINT).toBe(768);
    });

    it('classifies smartphone screens as mobile', () => {
      // iPhone SE, iPhone 12/13/14, Android
      expect(isMobileViewport(320)).toBe(true);
      expect(isMobileViewport(375)).toBe(true);
      expect(isMobileViewport(390)).toBe(true);
      expect(isMobileViewport(412)).toBe(true);
      expect(isMobileViewport(430)).toBe(true);
    });

    it('classifies small handheld and compact viewports as mobile', () => {
      expect(isMobileViewport(480)).toBe(true);
      expect(isMobileViewport(600)).toBe(true);
      expect(isMobileViewport(767)).toBe(true);
    });

    it('classifies tablet and desktop viewports as non-mobile (inline sidebar)', () => {
      // iPad portrait/landscape, desktop monitors
      expect(isMobileViewport(768)).toBe(false);
      expect(isMobileViewport(810)).toBe(false);
      expect(isMobileViewport(1024)).toBe(false);
      expect(isMobileViewport(1280)).toBe(false);
      expect(isMobileViewport(1920)).toBe(false);
    });

    it('allows custom breakpoint thresholds', () => {
      expect(isMobileViewport(500, 500)).toBe(false);
      expect(isMobileViewport(499, 500)).toBe(true);
      expect(isMobileViewport(1000, 1200)).toBe(true);
    });
  });

  describe('Terminal Font Size Optimization', () => {
    it('scales to 12px on handheld / smartphone viewports (< 480px) for maximum character columns', () => {
      expect(getTerminalFontSize(320)).toBe(12);
      expect(getTerminalFontSize(360)).toBe(12);
      expect(getTerminalFontSize(375)).toBe(12);
      expect(getTerminalFontSize(412)).toBe(12);
      expect(getTerminalFontSize(479)).toBe(12);
    });

    it('scales to 13px on small tablets and compact handheld viewports (480px - 767px)', () => {
      expect(getTerminalFontSize(480)).toBe(13);
      expect(getTerminalFontSize(540)).toBe(13);
      expect(getTerminalFontSize(600)).toBe(13);
      expect(getTerminalFontSize(720)).toBe(13);
      expect(getTerminalFontSize(767)).toBe(13);
    });

    it('scales to 15px on desktop and large tablet screens (>= 768px)', () => {
      expect(getTerminalFontSize(768)).toBe(15);
      expect(getTerminalFontSize(1024)).toBe(15);
      expect(getTerminalFontSize(1440)).toBe(15);
      expect(getTerminalFontSize(2560)).toBe(15);
    });
  });

  describe('TabManager Responsive Touch Targets & Layout', () => {
    const mockProfiles = [
      { name: 'Island Server Alpha With Long Name That Could Overflow', host: '127.0.0.1', port: 7777, password: 'pass' },
      { name: 'Scorched Earth', host: '127.0.0.1', port: 7779, password: 'pass' },
    ];
    const mockStatusMap = {
      '127.0.0.1:7777': { running: true, startTime: Date.now() - 3600000 },
      '127.0.0.1:7779': { running: false },
    };
    const mockRconStatusMap = {
      '127.0.0.1:7777': { status: 'connected', since: Date.now() },
      '127.0.0.1:7779': { status: 'disconnected', since: Date.now() },
    };

    it('renders server list items with touch-friendly min-height and ellipsis styling', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(TabManager, {
          serverProfiles: mockProfiles,
          statusMap: mockStatusMap,
          rconStatusMap: mockRconStatusMap,
          onTabSelect: jest.fn(),
          activeTab: '127.0.0.1:7777',
          onHandleSendServerShutdown: jest.fn(),
          onHandleSendForceStart: jest.fn(),
        })
      );

      // Verify touch target min-height of at least 44px
      expect(html).toContain('min-height:44px');

      // Verify text-overflow: ellipsis to prevent horizontal overflow in mobile drawer
      expect(html).toContain('text-overflow:ellipsis');
      expect(html).toContain('overflow:hidden');

      // Verify Start and Stop buttons are rendered with flex-shrink: 0 to maintain accessibility
      expect(html).toContain('flex-shrink:0');
      expect(html).toContain('title="Start server"');
      expect(html).toContain('title="Stop server"');
    });

    it('renders batch action controls with flex-wrap on selection', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(TabManager, {
          serverProfiles: mockProfiles,
          statusMap: mockStatusMap,
          rconStatusMap: mockRconStatusMap,
          onTabSelect: jest.fn(),
          activeTab: '127.0.0.1:7777',
          onHandleSendServerShutdown: jest.fn(),
          onHandleSendForceStart: jest.fn(),
          selectedKeys: ['127.0.0.1:7777', '127.0.0.1:7779'],
          onSelectionChange: jest.fn(),
        })
      );

      // Verify batch controls have flex-wrap and accessible min-height
      expect(html).toContain('flex-wrap:wrap');
      expect(html).toContain('min-height:32px');
      expect(html).toContain('title="Start all selected servers"');
      expect(html).toContain('title="Stop all selected servers"');
    });
  });

  describe('ServerConfigTab Responsive Toolbar & Wrapping', () => {
    it('renders config toolbar with flex-wrap and touch-friendly button targets', () => {
      const mockProfiles = [
        { name: 'Island Server', host: '127.0.0.1', port: 7777, password: 'pass' },
      ];
      const wsRefMock = { current: null };

      const html = ReactDOMServer.renderToString(
        React.createElement(ServerConfigTab, {
          serverProfiles: mockProfiles,
          statusMap: { '127.0.0.1:7777': { running: false } },
          selectedKey: '127.0.0.1:7777',
          onTabSelect: jest.fn(),
          onManageServers: jest.fn(),
          onViewLogs: jest.fn(),
          wsRef: wsRefMock,
        })
      );

      // Verify flex-wrap is present on the action bar and buttons
      expect(html).toContain('flex-wrap:wrap');
      expect(html).toContain('min-height:34px');
      expect(html).toContain('Edit Game.ini');
      expect(html).toContain('Edit GameUserSettings.ini');
      expect(html).toContain('Revision History / Restore Backup');
    });
  });
});
