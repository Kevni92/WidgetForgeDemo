<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import {
  developerDiagnosticsSchema,
  type DeveloperDiagnosticsData,
} from '@widgetforge-demo/protocol';
import type {
  DataClient,
  DataClientDiagnostics,
  MutationClient,
  MutationClientDiagnostics,
  RealtimeConnectionState,
} from 'widgetforge';
import type { DemoRealtimeTransport } from './realtime/demo-realtime-transport';

const props = defineProps<{
  transport: DemoRealtimeTransport;
  dataClient: DataClient;
  mutationClient: MutationClient;
}>();

const isDevelopment = import.meta.env.DEV;
const connectionState = shallowRef<RealtimeConnectionState>(props.transport.connectionState);
const dataDiagnostics = shallowRef<DataClientDiagnostics>(props.dataClient.diagnostics());
const mutationDiagnostics = shallowRef<MutationClientDiagnostics>(props.mutationClient.diagnostics());
const serverDiagnostics = shallowRef<DeveloperDiagnosticsData | null>(null);
const serverError = ref<string | null>(null);
const resetState = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
const resetMessage = ref<string | null>(null);
let stopConnection: (() => void) | null = null;
let stopDataDiagnostics: (() => void) | null = null;
let stopMutationDiagnostics: (() => void) | null = null;
let refreshTimer: ReturnType<typeof globalThis.setInterval> | null = null;

const clientResourceSummary = computed(() => dataDiagnostics.value.resources
  .filter((resource) => resource.consumers > 0)
  .map((resource) => `${resource.key.kind} (${resource.consumers})`)
  .join(', ') || 'none');
const serverResourceSummary = computed(() => serverDiagnostics.value?.subscriptions.byResource
  .filter((resource) => resource.count > 0)
  .map((resource) => `${resource.resource} (${resource.count})`)
  .join(', ') || 'none');
const connectionLabel = computed(() => connectionState.value.status === 'error'
  ? `${connectionState.value.status}: ${connectionState.value.error.message}`
  : connectionState.value.status);

onMounted(() => {
  stopConnection = props.transport.observeConnection((state) => {
    connectionState.value = state;
  });
  stopDataDiagnostics = props.dataClient.subscribeDiagnostics((diagnostics) => {
    dataDiagnostics.value = diagnostics;
  });
  stopMutationDiagnostics = props.mutationClient.subscribeDiagnostics((diagnostics) => {
    mutationDiagnostics.value = diagnostics;
  });
  void refreshServerDiagnostics();
  refreshTimer = globalThis.setInterval(() => void refreshServerDiagnostics(), 1000);
});

onUnmounted(() => {
  stopConnection?.();
  stopDataDiagnostics?.();
  stopMutationDiagnostics?.();
  if (refreshTimer !== null) globalThis.clearInterval(refreshTimer);
});

async function refreshServerDiagnostics(): Promise<void> {
  try {
    const response = await globalThis.fetch('/dev/diagnostics');
    if (!response.ok) throw new Error(`Diagnostics request failed (${response.status})`);
    serverDiagnostics.value = developerDiagnosticsSchema.parse(await response.json());
    serverError.value = null;
  } catch (error) {
    serverDiagnostics.value = null;
    serverError.value = error instanceof Error ? error.message : String(error);
  }
}

async function resetDemoState(): Promise<void> {
  if (!isDevelopment || resetState.value === 'pending') return;
  resetState.value = 'pending';
  resetMessage.value = null;
  try {
    const response = await globalThis.fetch('/dev/reset', { method: 'POST' });
    if (!response.ok) throw new Error(`Reset request failed (${response.status})`);
    serverDiagnostics.value = developerDiagnosticsSchema.parse(await response.json());
    serverError.value = null;
    resetState.value = 'success';
    resetMessage.value = 'Demo state reset; subscribed resources received fresh snapshots.';
  } catch (error) {
    resetState.value = 'error';
    resetMessage.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <aside
    class="developer-diagnostics"
    data-testid="developer-diagnostics"
    aria-label="Developer diagnostics"
  >
    <div class="diagnostics-header">
      <div>
        <strong>Developer diagnostics</strong>
        <span>read-only state and connection counters</span>
      </div>
      <button
        v-if="isDevelopment"
        type="button"
        data-testid="developer-reset"
        :disabled="resetState === 'pending'"
        @click="void resetDemoState()"
      >
        {{ resetState === 'pending' ? 'Resetting…' : 'Reset demo state' }}
      </button>
    </div>

    <dl class="diagnostics-grid">
      <dt>Connection</dt>
      <dd>{{ connectionLabel }} · {{ transport.currentDemoPlayerId }}</dd>
      <dt>Client resources</dt>
      <dd>{{ dataDiagnostics.activeResources }} active / {{ dataDiagnostics.totalConsumers }} consumers</dd>
      <dt>Wire subscriptions</dt>
      <dd>{{ transport.activeSubscriptionCount }} · {{ clientResourceSummary }}</dd>
      <dt>Pending mutations</dt>
      <dd>{{ mutationDiagnostics.activeInvocations }}</dd>
      <dt>Server</dt>
      <dd v-if="serverDiagnostics">
        {{ serverDiagnostics.connections.active }} connections ·
        {{ serverDiagnostics.subscriptions.total }} subscriptions ·
        {{ serverDiagnostics.pendingMutations }} pending
      </dd>
      <dd v-else>
        unavailable
      </dd>
      <dt>Server resources</dt>
      <dd>{{ serverResourceSummary }}</dd>
      <dt>Database</dt>
      <dd>{{ serverDiagnostics?.databasePath ?? 'unavailable' }}</dd>
    </dl>
    <p
      v-if="serverError"
      class="diagnostics-message diagnostics-message--error"
      role="status"
    >
      Server diagnostics unavailable: {{ serverError }}
    </p>
    <p
      v-if="resetMessage"
      class="diagnostics-message"
      :class="{ 'diagnostics-message--error': resetState === 'error' }"
      role="status"
    >
      {{ resetMessage }}
    </p>
  </aside>
</template>

<style scoped>
.developer-diagnostics {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--wf-color-border);
  border-radius: var(--wf-radius-md);
  background: var(--wf-color-surface-raised);
  color: var(--wf-color-text);
  font-size: var(--wf-font-size-sm);
}

.diagnostics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.diagnostics-header > div {
  display: grid;
  gap: 0.15rem;
}

.diagnostics-header span,
.diagnostics-message {
  color: var(--wf-color-text-muted);
  font-size: var(--wf-font-size-xs);
}

button {
  min-height: var(--wf-size-control-height-compact);
  padding: 0 var(--wf-space-sm);
  border: 1px solid var(--wf-color-border);
  border-radius: var(--wf-radius-sm);
  background: var(--wf-color-surface);
  color: var(--wf-color-text);
  font: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.diagnostics-grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.2rem 1rem;
  margin: 0;
}

dt {
  color: var(--wf-color-text-muted);
}

dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnostics-message {
  margin: 0;
}

.diagnostics-message--error {
  color: var(--wf-color-danger);
}

@media (max-width: 760px) {
  .diagnostics-header {
    align-items: start;
    flex-direction: column;
  }
}
</style>
