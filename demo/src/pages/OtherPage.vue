<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const width = ref(window.innerWidth);
const onResize = () => (width.value = window.innerWidth);
onMounted(() => window.addEventListener("resize", onResize));
onUnmounted(() => window.removeEventListener("resize", onResize));
</script>

<template>
  <main data-testid="other-page">
    <h1>Other</h1>
    <p>Window width: {{ width }}</p>
  </main>
</template>
