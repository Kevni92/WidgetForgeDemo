<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  DataClientProvider,
  MutationClientProvider,
  ThemeProvider,
  WindowManagerHost,
  forgeDarkTheme,
} from 'widgetforge';
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
  <ThemeProvider :theme="forgeDarkTheme">
    <DataClientProvider :client="dataClient">
      <MutationClientProvider :client="mutationClient">
        <main class="app-shell">
          <header class="app-header">
            <div class="app-title">
              <h1>WidgetForge Demo</h1>
              <p>Bootstrap ready</p>
            </div>
            <div class="connection-controls">
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
            </div>
          </header>
          <section
            class="workspace-shell"
            aria-label="WidgetForge workspace"
          >
            <WindowManagerHost
              :manager="manager"
              :registry="registry"
            />
          </section>
        </main>
      </MutationClientProvider>
    </DataClientProvider>
  </ThemeProvider>
</template>

<style>
:root {
  color-scheme: dark;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 1rem;
  padding: 1rem;
  box-sizing: border-box;
  background: var(--wf-color-canvas);
  color: var(--wf-color-text);
  font-family: var(--wf-font-family);
}

.app-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
}

.app-title {
  display: grid;
  gap: 0.25rem;
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

.connection-controls {
  display: flex;
  align-items: end;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: end;
}

.workspace-shell {
  position: relative;
  min-height: 640px;
  overflow: hidden;
  border: 1px solid var(--wf-color-border);
  border-radius: var(--wf-radius-md);
  background: var(--wf-color-surface);
}

h1 {
  margin: 0;
  font-size: 2rem;
}

p {
  margin: 0;
  color: #94a3b8;
}

@media (max-width: 760px) {
  .app-header {
    flex-direction: column;
  }

  .connection-controls {
    justify-content: start;
  }
}
</style>
