<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { DataClientProvider, MutationClientProvider } from 'widgetforge';
import type { DemoClientRuntime } from './client-runtime';

const props = defineProps<DemoClientRuntime>();
const connectionStatus = ref(props.transport.connectionState.status);
const connectionError = ref<string | null>(props.transport.connectionState.error?.message ?? null);
const selectedPlayerId = ref(props.transport.currentDemoPlayerId);
let stopObservingConnection: (() => void) | null = null;

onMounted(() => {
  stopObservingConnection = props.transport.observeConnection((state) => {
    connectionStatus.value = state.status;
    connectionError.value = state.error?.message ?? null;
  });
});

onUnmounted(() => stopObservingConnection?.());

async function changePlayer(): Promise<void> {
  await props.transport.setDemoPlayerId(selectedPlayerId.value);
}
</script>

<template>
  <DataClientProvider :client="dataClient">
    <MutationClientProvider :client="mutationClient">
      <main class="app-shell">
        <h1>WidgetForge Demo</h1>
        <p>Bootstrap ready</p>
        <label>
          Demo player
          <select
            v-model="selectedPlayerId"
            @change="void changePlayer()"
          >
            <option value="player-a">Player A</option>
            <option value="player-b">Player B</option>
          </select>
        </label>
        <p data-testid="connection-status">
          Connection: {{ connectionStatus }}
        </p>
        <p
          v-if="connectionError"
          class="error"
        >
          {{ connectionError }}
        </p>
      </main>
    </MutationClientProvider>
  </DataClientProvider>
</template>

<style>
:root {
  color: #e2e8f0;
  background: #0f172a;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-content: center;
  gap: 0.5rem;
  text-align: center;
}

label {
  display: grid;
  gap: 0.25rem;
  text-align: left;
}

select {
  min-width: 10rem;
  padding: 0.35rem;
}

.error {
  color: #fca5a5;
}

h1 {
  margin: 0;
  font-size: 2rem;
}

p {
  margin: 0;
  color: #94a3b8;
}
</style>
