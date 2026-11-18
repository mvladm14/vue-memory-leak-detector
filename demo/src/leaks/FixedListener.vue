<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  data: () => ({ width: window.innerWidth }),
  mounted() {
    window.addEventListener("resize", this.onResize);
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.onResize);
  },
  methods: {
    onResize() {
      this.width = window.innerWidth;
    },
  },
});
</script>

<template><p>Fixed listener: {{ width }}</p></template>
