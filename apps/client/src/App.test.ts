import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import App from './App.vue';
import { createDemoClientRuntime } from './client-runtime';

describe('App', () => {
  it('renders the bootstrap shell', () => {
    const runtime = createDemoClientRuntime({ url: 'ws://test/ws', demoPlayerId: 'player-a' });
    const wrapper = mount(App, { props: runtime });

    expect(wrapper.get('h1').text()).toBe('WidgetForge Demo');
    expect(wrapper.text()).toContain('Bootstrap ready');
    expect(wrapper.get('[data-testid="connection-status"]').text()).toContain('disconnected');
    runtime.transport.dispose();
  });
});
