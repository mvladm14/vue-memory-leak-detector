<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from "vue";
import { detached } from "../bus";

const root = useTemplateRef<HTMLElement>("root");
onMounted(() => detached.push(root.value!));
onUnmounted(() => detached.splice(detached.indexOf(root.value!), 1));
</script>

<template><p ref="root">Fixed DOM</p></template>
