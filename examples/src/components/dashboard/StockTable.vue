<!-- 示範用的來源檔，見 useDashboardData.ts 的說明。 -->
<script setup lang="ts">
const props = defineProps<{ items: InventoryItem[] }>();

// 低於安全庫存者才進表，並依剩餘量由少到多排序
const rows = computed(() =>
  props.items.filter((item) => item.stock < item.safetyStock).sort((a, b) => a.stock - b.stock),
);
</script>

<template>
  <table v-if="rows.length">
    <tr v-for="row in rows" :key="row.sku">
      <td>{{ row.name }}</td>
      <td>{{ row.stock }}</td>
    </tr>
  </table>
  <p v-else class="empty">目前沒有低庫存品項</p>
</template>
