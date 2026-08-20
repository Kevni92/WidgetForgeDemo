<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SimpleTable,
  createMutationDefinition,
  useData,
  useMutation,
  type SimpleTableColumn,
} from 'widgetforge';
import type {
  CancelOrderInput,
  CancelOrderResult,
  MarketMyOrdersData,
  MyOrder,
} from '@widgetforge-demo/protocol';
import { createMarketMyOrdersDataKey } from '../realtime/demo-realtime-transport';

const props = defineProps<{
  marketId: string;
  commodityId?: string;
}>();

const resource = useData(createMarketMyOrdersDataKey({
  marketId: props.marketId,
  ...(props.commodityId ? { commodityId: props.commodityId } : {}),
}));
const cancelOrder = createMutationDefinition<CancelOrderInput, CancelOrderResult>('market.cancelOrder');
const mutation = useMutation(cancelOrder);
const cancelPendingId = ref<string | null>(null);
const cancelError = ref<string | null>(null);
const cancelSuccess = ref<string | null>(null);
const data = computed<MarketMyOrdersData | null>(() => resource.value.status === 'ready'
  ? resource.value.data
  : resource.value.status === 'error'
    ? resource.value.data
    : null);
const orders = computed(() => data.value?.orders ?? []);

const columns: readonly SimpleTableColumn<MyOrder>[] = [
  { id: 'commodity', header: 'Commodity', field: 'commodityId' },
  { id: 'side', header: 'Side', field: 'side', align: 'center' },
  {
    id: 'price',
    header: 'Limit price',
    value: (order) => order.priceMinor,
    format: (value) => formatPrice(Number(value)),
    align: 'end',
  },
  { id: 'original', header: 'Original', field: 'originalQuantity', align: 'end' },
  { id: 'remaining', header: 'Remaining', field: 'remainingQuantity', align: 'end' },
  { id: 'status', header: 'Status', field: 'status', align: 'center' },
  {
    id: 'created',
    header: 'Created',
    value: (order) => order.createdAt,
    format: (value) => formatCreatedAt(String(value)),
  },
  { id: 'action', header: 'Action', value: () => '' },
];

async function cancel(orderId: string): Promise<void> {
  if (cancelPendingId.value) return;
  cancelPendingId.value = orderId;
  cancelError.value = null;
  cancelSuccess.value = null;
  try {
    await mutation.execute({ orderId });
    cancelSuccess.value = 'Cancel accepted; waiting for the server snapshot.';
  } catch (error) {
    cancelError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (cancelPendingId.value === orderId) cancelPendingId.value = null;
  }
}

function formatPrice(priceMinor: number): string {
  return (priceMinor / 100).toFixed(2);
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function commodityLabel(commodityId: string): string {
  const labels: Record<string, string> = { iron: 'Iron', copper: 'Copper', water: 'Water' };
  return labels[commodityId] ?? commodityId;
}
</script>

<template>
  <LoadingState
    v-if="resource.status === 'loading'"
    message="Loading your orders…"
    compact
  />
  <ErrorState
    v-else-if="resource.status === 'error'"
    title="Orders unavailable"
    :message="resource.error.message"
    compact
  />
  <EmptyState
    v-else-if="orders.length === 0"
    title="No open orders"
    message="Orders with remaining quantity will appear here."
    compact
  />
  <div
    v-else
    class="orders-content"
  >
    <SimpleTable
      :rows="orders"
      :columns="columns"
      aria-label="My open orders"
      compact
    >
      <template #cell-commodity="{ value }">
        {{ commodityLabel(String(value)) }}
      </template>
      <template #cell-action="{ row }">
        <button
          type="button"
          :disabled="cancelPendingId !== null"
          :aria-label="`Cancel order ${row.id}`"
          @click="void cancel(row.id)"
        >
          {{ cancelPendingId === row.id ? 'Cancelling…' : 'Cancel' }}
        </button>
      </template>
    </SimpleTable>
    <ErrorState
      v-if="cancelError"
      :message="cancelError"
      compact
    />
    <p
      v-else-if="cancelSuccess"
      class="success-message"
      role="status"
    >
      {{ cancelSuccess }}
    </p>
  </div>
</template>

<style scoped>
.orders-content {
  display: grid;
  gap: var(--wf-space-sm);
  min-width: 0;
}

button {
  min-height: var(--wf-size-control-height-compact);
  padding: 0 var(--wf-space-sm);
  border: 1px solid var(--wf-color-border);
  border-radius: var(--wf-radius-sm);
  background: var(--wf-color-surface-raised);
  color: var(--wf-color-text);
  font: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.success-message {
  color: var(--wf-color-success);
  font-size: var(--wf-font-size-sm);
}
</style>
