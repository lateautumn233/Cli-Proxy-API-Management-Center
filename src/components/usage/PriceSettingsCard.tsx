import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import {
  findModelPriceOverrideKey,
  findModelPriceOverrideKeys,
  getConfigurableModelPriceModels,
  getDefaultModelPrice,
  getDisplayModelPriceName,
  resolveModelPrice,
  type ModelPrice,
} from '@/utils/usage';
import styles from '@/pages/UsagePage.module.scss';

export interface PriceSettingsCardProps {
  modelNames: string[];
  modelPrices: Record<string, ModelPrice>;
  onPricesChange: (prices: Record<string, ModelPrice>) => void;
}

export function PriceSettingsCard({
  modelNames,
  modelPrices,
  onPricesChange,
}: PriceSettingsCardProps) {
  const { t } = useTranslation();
  const usageModelNameSet = useMemo(
    () => new Set(modelNames.map((name) => getDisplayModelPriceName(name))),
    [modelNames]
  );

  // Add form state
  const [selectedModel, setSelectedModel] = useState('');
  const [promptPrice, setPromptPrice] = useState('');
  const [completionPrice, setCompletionPrice] = useState('');
  const [cachePrice, setCachePrice] = useState('');

  // Edit modal state
  const [editModel, setEditModel] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editCompletion, setEditCompletion] = useState('');
  const [editCache, setEditCache] = useState('');

  const buildNextPrices = (model: string, price: ModelPrice) => {
    const nextPrices = { ...modelPrices };
    findModelPriceOverrideKeys(model, modelPrices).forEach((matchedKey) => {
      delete nextPrices[matchedKey];
    });
    nextPrices[model] = price;
    return nextPrices;
  };

  const handleSavePrice = () => {
    if (!selectedModel) return;
    const prompt = parseFloat(promptPrice) || 0;
    const completion = parseFloat(completionPrice) || 0;
    const cache = cachePrice.trim() === '' ? prompt : parseFloat(cachePrice) || 0;
    const newPrices = buildNextPrices(selectedModel, { prompt, completion, cache });
    onPricesChange(newPrices);
    setSelectedModel('');
    setPromptPrice('');
    setCompletionPrice('');
    setCachePrice('');
  };

  const handleDeletePrice = (model: string) => {
    const overrideKeys = findModelPriceOverrideKeys(model, modelPrices);
    if (overrideKeys.length === 0) {
      return;
    }
    const newPrices = { ...modelPrices };
    overrideKeys.forEach((overrideKey) => {
      delete newPrices[overrideKey];
    });
    onPricesChange(newPrices);
  };

  const handleOpenEdit = (model: string) => {
    const price = resolveModelPrice(model, modelPrices);
    setEditModel(model);
    setEditPrompt(price?.prompt?.toString() || '');
    setEditCompletion(price?.completion?.toString() || '');
    setEditCache(price?.cache?.toString() || '');
  };

  const handleSaveEdit = () => {
    if (!editModel) return;
    const prompt = parseFloat(editPrompt) || 0;
    const completion = parseFloat(editCompletion) || 0;
    const cache = editCache.trim() === '' ? prompt : parseFloat(editCache) || 0;
    const newPrices = buildNextPrices(editModel, { prompt, completion, cache });
    onPricesChange(newPrices);
    setEditModel(null);
  };

  const handleModelSelect = (value: string) => {
    setSelectedModel(value);
    const price = resolveModelPrice(value, modelPrices);
    if (price) {
      setPromptPrice(price.prompt.toString());
      setCompletionPrice(price.completion.toString());
      setCachePrice(price.cache.toString());
    } else {
      setPromptPrice('');
      setCompletionPrice('');
      setCachePrice('');
    }
  };

  const configurableModels = useMemo(() => {
    const items = getConfigurableModelPriceModels(modelNames, modelPrices);
    return items.sort((left, right) => {
      const leftHasOverride = findModelPriceOverrideKey(left, modelPrices) !== null;
      const rightHasOverride = findModelPriceOverrideKey(right, modelPrices) !== null;
      if (leftHasOverride !== rightHasOverride) {
        return leftHasOverride ? -1 : 1;
      }

      const leftInUsage = usageModelNameSet.has(left);
      const rightInUsage = usageModelNameSet.has(right);
      if (leftInUsage !== rightInUsage) {
        return leftInUsage ? -1 : 1;
      }

      return left.localeCompare(right);
    });
  }, [modelNames, modelPrices, usageModelNameSet]);

  const effectivePriceEntries = useMemo(
    () =>
      configurableModels
        .map((model) => {
          const price = resolveModelPrice(model, modelPrices);
          if (!price) {
            return null;
          }
          const hasOverride = findModelPriceOverrideKey(model, modelPrices) !== null;
          const hasDefault = getDefaultModelPrice(model) !== null;
          return {
            model,
            price,
            hasOverride,
            hasDefault,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            model: string;
            price: ModelPrice;
            hasOverride: boolean;
            hasDefault: boolean;
          } => entry !== null
        ),
    [configurableModels, modelPrices]
  );

  const options = useMemo(
    () => [
      { value: '', label: t('usage_stats.model_price_select_placeholder') },
      ...configurableModels.map((name) => ({ value: name, label: name })),
    ],
    [configurableModels, t]
  );

  return (
    <Card title={t('usage_stats.model_price_settings')}>
      <div className={styles.pricingSection}>
        {/* Price Form */}
        <div className={styles.priceForm}>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_name')}</label>
              <Select
                value={selectedModel}
                options={options}
                onChange={handleModelSelect}
                placeholder={t('usage_stats.model_price_select_placeholder')}
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_prompt')} ($/1M)</label>
              <Input
                type="number"
                value={promptPrice}
                onChange={(e) => setPromptPrice(e.target.value)}
                placeholder="0.00"
                step="0.0001"
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_completion')} ($/1M)</label>
              <Input
                type="number"
                value={completionPrice}
                onChange={(e) => setCompletionPrice(e.target.value)}
                placeholder="0.00"
                step="0.0001"
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_cache')} ($/1M)</label>
              <Input
                type="number"
                value={cachePrice}
                onChange={(e) => setCachePrice(e.target.value)}
                placeholder="0.00"
                step="0.0001"
              />
            </div>
            <Button variant="primary" onClick={handleSavePrice} disabled={!selectedModel}>
              {t('common.save')}
            </Button>
          </div>
          <div className={styles.hint}>{t('usage_stats.model_price_default_hint')}</div>
        </div>

        {/* Saved Prices List */}
        <div className={styles.pricesList}>
          <h4 className={styles.pricesTitle}>{t('usage_stats.model_price_effective_list')}</h4>
          {effectivePriceEntries.length > 0 ? (
            <div className={styles.pricesGrid}>
              {effectivePriceEntries.map(({ model, price, hasOverride, hasDefault }) => (
                <div key={model} className={styles.priceItem}>
                  <div className={styles.priceInfo}>
                    <div className={styles.priceHeader}>
                      <span className={styles.priceModel}>{model}</span>
                      <span
                        className={`${styles.priceTag} ${
                          hasOverride ? styles.priceTagCustom : styles.priceTagDefault
                        }`}
                      >
                        {hasOverride
                          ? t('usage_stats.model_price_source_override')
                          : t('usage_stats.model_price_source_default')}
                      </span>
                    </div>
                    <div className={styles.priceMeta}>
                      <span>
                        {t('usage_stats.model_price_prompt')}: ${price.prompt.toFixed(4)}/1M
                      </span>
                      <span>
                        {t('usage_stats.model_price_completion')}: ${price.completion.toFixed(4)}/1M
                      </span>
                      <span>
                        {t('usage_stats.model_price_cache')}: ${price.cache.toFixed(4)}/1M
                      </span>
                    </div>
                  </div>
                  <div className={styles.priceActions}>
                    <Button variant="secondary" size="sm" onClick={() => handleOpenEdit(model)}>
                      {t('common.edit')}
                    </Button>
                    {hasOverride && (
                      <Button
                        variant={hasDefault ? 'secondary' : 'danger'}
                        size="sm"
                        onClick={() => handleDeletePrice(model)}
                      >
                        {hasDefault
                          ? t('usage_stats.model_price_reset_to_default')
                          : t('common.delete')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.hint}>{t('usage_stats.model_price_empty')}</div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={editModel !== null}
        title={editModel ?? ''}
        onClose={() => setEditModel(null)}
        footer={
          <div className={styles.priceActions}>
            <Button variant="secondary" onClick={() => setEditModel(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSaveEdit}>
              {t('common.save')}
            </Button>
          </div>
        }
        width={420}
      >
        <div className={styles.editModalBody}>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_prompt')} ($/1M)</label>
            <Input
              type="number"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="0.00"
              step="0.0001"
            />
          </div>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_completion')} ($/1M)</label>
            <Input
              type="number"
              value={editCompletion}
              onChange={(e) => setEditCompletion(e.target.value)}
              placeholder="0.00"
              step="0.0001"
            />
          </div>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_cache')} ($/1M)</label>
            <Input
              type="number"
              value={editCache}
              onChange={(e) => setEditCache(e.target.value)}
              placeholder="0.00"
              step="0.0001"
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
}
