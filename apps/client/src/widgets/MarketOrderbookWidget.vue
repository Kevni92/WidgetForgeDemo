<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ErrorState,
  useMutation,
  useWidgetContext,
  createMutationDefinition,
} from 'widgetforge';
import type {
  OrderSide,
  PlaceOrderInput,
  PlaceOrderResult,
} from '@widgetforge-demo/protocol';
import MarketOrderbookResource from './MarketOrderbookResource.vue';

interface MarketWidgetParameters extends Record<string, unknown> {
  readonly marketId: string;
}

const commodities = [
  { id: 'iron', label: 'Iron' },
  { id: 'copper', label: 'Copper' },
  { id: 'water', label: 'Water' },
] as const;
const placeOrder = createMutationDefinition<PlaceOrderInput, PlaceOrderResult>('market.placeOrder');
const widgetContext = useWidgetContext<MarketWidgetParameters>();
const marketId = computed(() => widgetContext.parameters.value.marketId);
const selectedCommodity = ref<(typeof commodities)[number]['id']>('iron');
const side = ref<OrderSide>('BUY');
const priceMinor = ref(100);
const quantity = ref(1);
const formError = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const mutation = useMutation(placeOrder);
const pending = computed(() => mutation.state.value.status === 'pending');
const mutationError = computed(() => mutation.state.value.status === 'error'
  ? mutation.state.value.error.message
  : null);

async function submitOrder(): Promise<void> {
  formError.value = null;
  successMessage.value = null;
  if (!Number.isInteger(priceMinor.value) || priceMinor.value <= 0) {
    formError.value = 'Price must be a positive integer in minor currency units.';
    return;
  }
  if (!Number.isInteger(quantity.value) || quantity.value <= 0) {
    formError.value = 'Quantity must be a positive integer.';
    return;
  }

  try {
    const result = await mutation.execute({
      marketId: marketId.value,
      commodityId: selectedCommodity.value,
      side: side.value,
      priceMinor: priceMinor.value,
      quantity: quantity.value,
    });
    successMessage.value = `Order ${result.orderId} accepted.`;
  } catch {
    // The WidgetForge mutation state exposes the normalized error to the view.
  }
}
</script>

<template>
  <article
    class="market-widget"
    :aria-busy="pending"
  >
    <header class="widget-header">
      <div>
        <h2>Market Orderbook</h2>
        <p>Live bids and asks for the selected commodity.</p>
      </div>
      <label>
        Commodity
        <select v-model="selectedCommodity">
          <option
            v-for="commodity in commodities"
            :key="commodity.id"
            :value="commodity.id"
          >
            {{ commodity.label }}
          </option>
        </select>
      </label>
    </header>

    <MarketOrderbookResource
      :key="selectedCommodity"
      :market-id="marketId"
      :commodity-id="selectedCommodity"
    />

    <form
      class="order-form"
      @submit.prevent="submitOrder"
    >
      <h3>Place limit order</h3>
      <div class="form-grid">
        <label>
          Side
          <select v-model="side">
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </label>
        <label>
          Price (minor)
          <input
            v-model.number="priceMinor"
            type="number"
            min="1"
            step="1"
          >
        </label>
        <label>
          Quantity
          <input
            v-model.number="quantity"
            type="number"
            min="1"
            step="1"
          >
        </label>
        <button
          type="submit"
          :disabled="pending"
        >
          {{ pending ? 'Submitting…' : 'Place order' }}
        </button>
      </div>
      <p
        v-if="formError"
        class="form-message form-message--error"
        role="alert"
      >
        {{ formError }}
      </p>
      <ErrorState
        v-else-if="mutationError"
        :message="mutationError"
        compact
      />
      <p
        v-else-if="successMessage"
        class="form-message form-message--success"
        role="status"
      >
        {{ successMessage }}
      </p>
    </form>
  </article>
</template>

<style scoped>
.market-widget {
  display: grid;
  gap: var(--wf-space-md);
  min-width: 0;
  padding: var(--wf-space-md);
  color: var(--wf-color-text);
}

.widget-header,
.form-grid {
  display: grid;
  gap: var(--wf-space-sm);
}

.widget-header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  font-size: var(--wf-font-size-lg);
}

h3 {
  font-size: var(--wf-font-size-md);
}

.widget-header p {
  margin-top: var(--wf-space-xs);
  color: var(--wf-color-text-muted);
  font-size: var(--wf-font-size-sm);
}

label {
  display: grid;
  gap: var(--wf-space-xs);
  color: var(--wf-color-text-muted);
  font-size: var(--wf-font-size-sm);
}

select,
input,
button {
  min-height: var(--wf-size-control-height-compact);
  border: 1px solid var(--wf-color-border);
  border-radius: var(--wf-radius-sm);
  background: var(--wf-color-surface-raised);
  color: var(--wf-color-text);
  font: inherit;
}

select,
input {
  padding: 0 var(--wf-space-sm);
}

.order-form {
  display: grid;
  gap: var(--wf-space-sm);
  padding-top: var(--wf-space-sm);
  border-top: 1px solid var(--wf-color-border);
}

.form-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
}

button {
  padding: 0 var(--wf-space-md);
  background: var(--wf-color-accent);
  color: var(--wf-color-on-accent);
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.form-message {
  font-size: var(--wf-font-size-sm);
}

.form-message--error {
  color: var(--wf-color-danger);
}

.form-message--success {
  color: var(--wf-color-success);
}

@media (max-width: 640px) {
  .widget-header,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
