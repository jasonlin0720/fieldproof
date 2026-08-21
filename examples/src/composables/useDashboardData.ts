/**
 * 示範用的來源檔——`examples/data/dashboard.json` 的 `sources` 指向這裡。
 *
 * 它存在的理由有兩個：讓那份範例自洽（`sources` 的路徑真的解析得到，否則漂移提示
 * 永遠不會發生作用），以及讓讀範例的人看得到「程式碼長這樣 → JSON 這樣寫」的對照。
 */

import { computed, ref } from 'vue';

export function useDashboardData(storeId: Ref<number | null>) {
  const enabled = computed(() => Boolean(storeId.value) && Number.isInteger(storeId.value));

  // Q1：今日銷售摘要，每分鐘刷新
  const summary = useQuery({
    enabled,
    queryFn: () => getOrderSummary({ From: startOfToday(), To: 'now' }),
    refetchInterval: 60_000,
  });

  // Q2：趨勢圖用的全量訂單，每小時刷新
  const orders = useQuery({
    queryFn: () => getOrders({ Page: 1, PageSize: 9999, Status: 'paid' }),
    refetchInterval: 3_600_000,
  });

  // 平均客單價由前端算——後端沒有這個欄位
  const averageOrderValue = computed(() =>
    orders.data.value?.items.length
      ? summary.data.value.totals.revenue / orders.data.value.items.length
      : null,
  );

  return { averageOrderValue, orders, summary };
}
