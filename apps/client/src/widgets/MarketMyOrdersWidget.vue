<script setup lang="ts">
import { computed, ref } from 'vue';
import { useWidgetContext } from 'widgetforge';
import MarketMyOrdersResource from './MarketMyOrdersResource.vue';

interface MyOrdersWidgetParameters extends Record<string, unknown> {
  readonly marketId: string;
}

const commodities = [
  { id: '', label: 'All commodities' },
  { id: 'iron', label: 'Iron' },
  { id: 'copper', label: 'Copper' },
  { id: 'water', label: 'Water' },
] as const;
const widgetContext = useWidgetContext<MyOrdersWidgetParameters>();
const marketId = computed(() => widgetContext.parameters.value.marketId);
const selectedCommodity = ref<(typeof commodities)[number]['id']>('');
</script>

<template>
  <article class="my-orders-widget">
    <header class="widget-header">
      <div>
        <h2>My Orders</h2>
        <p>Open and partially filled orders for this demo player.</p>
      </div>
      <label>
        Commodity
        <select v-model="selectedCommodity">
          <option
            v-for="commodity in commodities"
            :key="commodity.id || 'all'"
            :value="commodity.id"
          >
            {{ commodity.label }}
          </option>
        </select>
      </label>
    </header>

    <MarketMyOrdersResource
      :key="selectedCommodity || 'all'"
      :market-id="marketId"
      :commodity-id="selectedCommodity || undefined"
    />
  </article>
</template>

<style scoped>
.my-orders-widget {
  display: grid;
  gap: var(--wf-space-md);
  min-width: 0;
  padding: var(--wf-space-md);
  color: var(--wf-color-text);
}

.widget-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--wf-space-sm);
}

.widget-header > div {
  display: grid;
  gap: var(--wf-space-xs);
}

h2,
p {
  margin: 0;
}

h2 {
  font-size: var(--wf-font-size-lg);
}

p {
  color: var(--wf-color-text-muted);
  font-size: var(--wf-font-size-sm);
}

label {
  display: grid;
  gap: var(--wf-space-xs);
  color: var(--wf-color-text-muted);
  font-size: var(--wf-font-size-sm);
}

select {
  min-height: var(--wf-size-control-height-compact);
  padding: 0 var(--wf-space-sm);
  border: 1px solid var(--wf-color-border);
  border-radius: var(--wf-radius-sm);
  background: var(--wf-color-surface-raised);
  color: var(--wf-color-text);
  font: inherit;
}

@media (max-width: 640px) {
  .widget-header {
    grid-template-columns: 1fr;
  }
}
</style>
