import { mount } from '@vue/test-utils';
import type { DeveloperDiagnosticsData } from '@widgetforge-demo/protocol';
import { describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { createDemoClientRuntime } from './client-runtime';

describe('App', () => {
  it('renders the bootstrap shell', () => {
    const runtime = createDemoClientRuntime({ url: 'ws://test/ws', demoPlayerId: 'player-a' });
    const wrapper = mount(App, { props: runtime });

    expect(wrapper.get('h1').text()).toBe('WidgetForge Demo');
    expect(wrapper.text()).toContain('Bootstrap ready');
    expect(wrapper.get('[data-testid="connection-status"]').text()).toContain('disconnected');
    expect(wrapper.get('[data-testid="developer-diagnostics"]').text()).toContain('Developer diagnostics');
    expect(wrapper.get('[data-testid="developer-reset"]').text()).toContain('Reset demo state');
    wrapper.unmount();
    runtime.transport.dispose();
  });

  it('refreshes server diagnostics and invokes the development reset endpoint', async () => {
    const diagnostics: DeveloperDiagnosticsData = {
      environment: 'test',
      databasePath: ':memory:',
      protocolVersion: 1,
      connections: { active: 0, entries: [] },
      subscriptions: { total: 0, byResource: [] },
      pendingMutations: 0,
    };
    const response = {
      ok: true,
      status: 200,
      json: async () => diagnostics,
    } as Response;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const runtime = createDemoClientRuntime({ url: 'ws://test/ws', demoPlayerId: 'player-a' });
    const wrapper = mount(App, { props: runtime });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/dev/diagnostics'));
    await wrapper.get('[data-testid="developer-reset"]').trigger('click');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/dev/reset', { method: 'POST' }));
    expect(wrapper.text()).toContain('Demo state reset; subscribed resources received fresh snapshots.');

    wrapper.unmount();
    runtime.transport.dispose();
    fetchMock.mockRestore();
  });
});
