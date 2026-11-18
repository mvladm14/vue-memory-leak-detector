<script setup lang="ts">
import Card from "../components/Card.vue";
</script>

<template>
  <main data-testid="home-page">
    <h1>Home</h1>
    <Card v-for="n in 3" :key="n" :title="`Card ${n}`" />
  </main>
</template>
