<!-- 示範用的來源檔，見 useDashboardData.ts 的說明。 -->
<script setup lang="ts">
const props = defineProps<{ label: string; value: number | null }>();

// 千分位；null 退場為破折號
const display = computed(() => (props.value === null ? '—' : props.value.toLocaleString('zh-TW')));
</script>

<template>
  <article class="sales-card">
    <h3>{{ label }}</h3>
    <p class="value">{{ display }}<span class="unit">NT$</span></p>
  </article>
</template>
