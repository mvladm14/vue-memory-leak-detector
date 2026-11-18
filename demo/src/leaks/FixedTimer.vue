<script setup lang="ts">
import { onUnmounted, ref } from "vue";

const ticks = ref(0);
const id = setInterval(() => ticks.value++, 1000);
onUnmounted(() => clearInterval(id));
</script>

<template><p>Fixed timer: {{ ticks }}</p></template>
