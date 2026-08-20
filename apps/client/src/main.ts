import { createApp } from 'vue';
import App from './App.vue';
import { createDemoClientRuntime } from './client-runtime';

const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const websocketUrl = import.meta.env.VITE_WS_URL
  ?? `${websocketProtocol}//${window.location.host}/ws`;
const runtime = createDemoClientRuntime({
  url: websocketUrl,
  demoPlayerId: 'player-a',
});

createApp(App, runtime as unknown as Record<string, unknown>).mount('#app');
void runtime.transport.connect().catch(() => undefined);
window.addEventListener('beforeunload', () => runtime.transport.dispose(), { once: true });
