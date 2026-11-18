<script setup lang="ts">
import { ref } from "vue";

const ticks = ref(0);
// Never cleared: the callback, and the setup scope it closes over, outlive the component.
setInterval(() => ticks.value++, 1000);
</script>

<template><p>Leaky timer: {{ ticks }}</p></template>
