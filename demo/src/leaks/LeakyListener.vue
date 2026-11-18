<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  data: () => ({ width: window.innerWidth }),
  mounted() {
    // Never removed: `this.onResize` is bound to the component.
    window.addEventListener("resize", this.onResize);
  },
  methods: {
    onResize() {
      this.width = window.innerWidth;
    },
  },
});
</script>

<template><p>Leaky listener: {{ width }}</p></template>
