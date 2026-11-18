<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { bus } from "../bus";

const last = ref("");
const off = bus.on((message) => (last.value = message));
onUnmounted(off);
</script>

<template><p>Fixed bus: {{ last }}</p></template>
