<script setup lang="ts">
import { ref } from "vue";
import { bus } from "../bus";

const last = ref("");
bus.on((message) => (last.value = message));
</script>

<template><p>Leaky bus: {{ last }}</p></template>
