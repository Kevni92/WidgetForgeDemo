import { createApp } from 'vue';
import 'widgetforge/style.css';
import App from './App.vue';
import { createDemoClientRuntime } from './client-runtime';

const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const websocketUrl = import.meta.env.VITE_WS_URL
  ?? `${websocketProtocol}//${window.location.host}/ws`;
const runtime = createDemoClientRuntime({
  url: websocketUrl,
  demoPlayerId: 'player-a',
});

if (import.meta.env.DEV) {
  Object.defineProperty(window, '__widgetforgeDemoRuntime', {
    configurable: true,
    value: runtime,
  });
}

createApp(App, runtime as unknown as Record<string, unknown>).mount('#app');
void runtime.transport.connect().catch(() => undefined);
window.addEventListener('beforeunload', () => runtime.transport.dispose(), { once: true });
