<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <article class="card">{{ title }}</article>
</template>
