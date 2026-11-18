<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";
import { detached } from "../bus";

const root = useTemplateRef<HTMLElement>("root");
onMounted(() => detached.push(root.value!));
</script>

<template><p ref="root">Leaky DOM</p></template>
