<script setup lang="ts">
import { ref } from "vue";
import LeakyTimer from "./leaks/LeakyTimer.vue";
import FixedTimer from "./leaks/FixedTimer.vue";
import LeakyListener from "./leaks/LeakyListener.vue";
import FixedListener from "./leaks/FixedListener.vue";
import LeakyBus from "./leaks/LeakyBus.vue";
import FixedBus from "./leaks/FixedBus.vue";
import LeakyDom from "./leaks/LeakyDom.vue";
import FixedDom from "./leaks/FixedDom.vue";

const pairs = [
  { id: "timer", leaky: LeakyTimer, fixed: FixedTimer },
  { id: "listener", leaky: LeakyListener, fixed: FixedListener },
  { id: "bus", leaky: LeakyBus, fixed: FixedBus },
  { id: "dom", leaky: LeakyDom, fixed: FixedDom },
];
const shown = ref<Record<string, boolean>>({});
</script>

<template>
  <nav>
    <RouterLink to="/" data-testid="nav-home">Home</RouterLink> |
    <RouterLink to="/other" data-testid="nav-other">Other</RouterLink>
  </nav>
  <section v-for="pair in pairs" :key="pair.id">
    <template v-for="kind in ['leaky', 'fixed'] as const" :key="kind">
      <button :data-testid="`toggle-${kind}-${pair.id}`" @click="shown[`${kind}-${pair.id}`] = !shown[`${kind}-${pair.id}`]">
        Toggle {{ kind }} {{ pair.id }}
      </button>
      <component :is="pair[kind]" v-if="shown[`${kind}-${pair.id}`]" :data-testid="`${kind}-${pair.id}`" />
    </template>
  </section>
  <RouterView />
</template>
