<script setup lang="ts">
const status = 'Bootstrap ready';
</script>

<template>
  <main class="app-shell">
    <h1>WidgetForge Demo</h1>
    <p>{{ status }}</p>
  </main>
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

h1 {
  margin: 0;
  font-size: 2rem;
}

p {
  margin: 0;
  color: #94a3b8;
}
</style>
