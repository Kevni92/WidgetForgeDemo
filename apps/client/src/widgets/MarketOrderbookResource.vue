<script setup lang="ts">
import { computed } from 'vue';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  useData,
  type DataTableColumn,
} from 'widgetforge';
import type { MarketOrderbookData } from '@widgetforge-demo/protocol';
import { createMarketOrderbookDataKey } from '../realtime/demo-realtime-transport';

interface OrderbookRow {
  readonly id: string;
  readonly priceMinor: number;
  readonly quantity: number;
  readonly orderCount: number;
}

const props = defineProps<{
  marketId: string;
  commodityId: string;
}>();

const resource = useData(createMarketOrderbookDataKey({
  marketId: props.marketId,
  commodityId: props.commodityId,
}));

const rowsFor = (data: MarketOrderbookData | null, side: 'bid' | 'ask'): readonly OrderbookRow[] => {
  if (!data) return [];
  const levels = side === 'bid' ? data.bids : data.asks;
  return levels.map((level) => ({
    id: `${side}-${level.priceMinor}`,
    priceMinor: level.priceMinor,
    quantity: level.quantity,
    orderCount: level.orderCount,
  }));
};

const data = computed<MarketOrderbookData | null>(() => resource.value.status === 'ready'
  ? resource.value.data
  : resource.value.status === 'error'
    ? resource.value.data
    : null);
const bids = computed(() => rowsFor(data.value, 'bid'));
const asks = computed(() => rowsFor(data.value, 'ask'));
const isEmpty = computed(() => bids.value.length === 0 && asks.value.length === 0);

const columns: readonly DataTableColumn<OrderbookRow>[] = [
  {
    id: 'price',
    header: 'Price',
    value: (row) => row.priceMinor,
    format: (value) => formatPrice(Number(value)),
    sortable: false,
    align: 'end',
  },
  {
    id: 'quantity',
    header: 'Quantity',
    value: (row) => row.quantity,
    sortable: false,
    align: 'end',
  },
  {
    id: 'orders',
    header: 'Orders',
    value: (row) => row.orderCount,
    sortable: false,
    align: 'end',
  },
];

function rowId(row: OrderbookRow): string {
  return row.id;
}

function formatPrice(priceMinor: number): string {
  return (priceMinor / 100).toFixed(2);
}
</script>

<template>
  <LoadingState
    v-if="resource.status === 'loading'"
    message="Loading orderbook…"
    compact
  />
  <ErrorState
    v-else-if="resource.status === 'error'"
    title="Orderbook unavailable"
    :message="resource.error.message"
    compact
  />
  <EmptyState
    v-else-if="isEmpty"
    title="No open orders"
    message="The selected market has no open bids or asks."
    compact
  />
  <div
    v-else
    class="orderbook-grid"
  >
    <section aria-labelledby="bids-heading">
      <h3 id="bids-heading">
        Bids
      </h3>
      <DataTable
        :rows="bids"
        :columns="columns"
        :row-id="rowId"
        aria-label="Market bids"
        :filterable="false"
        compact
      />
    </section>
    <section aria-labelledby="asks-heading">
      <h3 id="asks-heading">
        Asks
      </h3>
      <DataTable
        :rows="asks"
        :columns="columns"
        :row-id="rowId"
        aria-label="Market asks"
        :filterable="false"
        compact
      />
    </section>
  </div>
</template>

<style scoped>
.orderbook-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--wf-space-sm);
}

section {
  min-width: 0;
}

h3 {
  margin: 0 0 var(--wf-space-xs);
  color: var(--wf-color-text-muted);
  font-size: var(--wf-font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

@media (max-width: 560px) {
  .orderbook-grid {
    grid-template-columns: 1fr;
  }
}
</style>
