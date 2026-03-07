import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { USAGE_STATS_STALE_TIME_MS, useNotificationStore, useUsageStatsStore } from '@/stores';
import { usageApi } from '@/services/api/usage';
import { downloadBlob } from '@/utils/download';
import {
  loadModelPrices,
  normalizeModelPrices,
  saveModelPrices,
  type ModelPrice,
} from '@/utils/usage';

export interface UsagePayload {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  apis?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UseUsageDataReturn {
  usage: UsagePayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  modelPrices: Record<string, ModelPrice>;
  setModelPrices: (prices: Record<string, ModelPrice>) => void;
  loadUsage: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: () => void;
  handleImportChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  exporting: boolean;
  importing: boolean;
}

const areModelPricesEqual = (
  left: Record<string, ModelPrice>,
  right: Record<string, ModelPrice>
): boolean => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) {
      return false;
    }
    const leftPrice = left[key];
    const rightPrice = right[key];
    return (
      leftPrice?.prompt === rightPrice?.prompt &&
      leftPrice?.completion === rightPrice?.completion &&
      leftPrice?.cache === rightPrice?.cache
    );
  });
};

const choosePersistedModelPrices = (
  remotePrices: Record<string, ModelPrice>,
  localPrices: Record<string, ModelPrice>
): Record<string, ModelPrice> =>
  Object.keys(remotePrices).length > 0 ? remotePrices : localPrices;

export function useUsageData(): UseUsageDataReturn {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const usageSnapshot = useUsageStatsStore((state) => state.usage);
  const loading = useUsageStatsStore((state) => state.loading);
  const storeError = useUsageStatsStore((state) => state.error);
  const lastRefreshedAtTs = useUsageStatsStore((state) => state.lastRefreshedAt);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const [modelPrices, setModelPrices] = useState<Record<string, ModelPrice>>({});
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const loadUsage = useCallback(async () => {
    await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [loadUsageStats]);

  useEffect(() => {
    let cancelled = false;

    void loadUsageStats({ staleTimeMs: USAGE_STATS_STALE_TIME_MS }).catch(() => {});

    const loadPersistedModelPrices = async () => {
      const localPrices = loadModelPrices();

      try {
        const response = await usageApi.getModelPrices();
        const remotePrices = normalizeModelPrices(response?.prices);
        const mergedPrices = choosePersistedModelPrices(remotePrices, localPrices);

        if (!cancelled) {
          setModelPrices(mergedPrices);
          saveModelPrices(mergedPrices);
        }

        if (!areModelPricesEqual(remotePrices, mergedPrices)) {
          try {
            await usageApi.saveModelPrices(mergedPrices);
          } catch {
            // Keep browser-local data as a compatibility fallback when server sync is unavailable.
          }
        }
      } catch {
        if (!cancelled) {
          setModelPrices(localPrices);
        }
      }
    };

    void loadPersistedModelPrices();

    return () => {
      cancelled = true;
    };
  }, [loadUsageStats]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usageApi.exportUsage();
      const exportedAt =
        typeof data?.exported_at === 'string' ? new Date(data.exported_at) : new Date();
      const safeTimestamp = Number.isNaN(exportedAt.getTime())
        ? new Date().toISOString()
        : exportedAt.toISOString();
      const filename = `usage-export-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
      downloadBlob({
        filename,
        blob: new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' }),
      });
      showNotification(t('usage_stats.export_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    importInputRef.current?.click();
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        showNotification(t('usage_stats.import_invalid'), 'error');
        return;
      }

      const result = await usageApi.importUsage(payload);
      showNotification(
        t('usage_stats.import_success', {
          added: result?.added ?? 0,
          skipped: result?.skipped ?? 0,
          total: result?.total_requests ?? 0,
          failed: result?.failed_requests ?? 0,
        }),
        'success'
      );
      try {
        await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleSetModelPrices = useCallback(
    (prices: Record<string, ModelPrice>) => {
      const normalizedPrices = normalizeModelPrices(prices);
      setModelPrices(normalizedPrices);
      saveModelPrices(normalizedPrices);
      void usageApi.saveModelPrices(normalizedPrices).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      });
    },
    [showNotification, t]
  );

  const usage = usageSnapshot as UsagePayload | null;
  const error = storeError || '';
  const lastRefreshedAt = lastRefreshedAtTs ? new Date(lastRefreshedAtTs) : null;

  return {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices: handleSetModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing,
  };
}
