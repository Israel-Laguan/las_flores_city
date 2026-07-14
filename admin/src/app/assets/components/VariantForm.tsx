'use client';

import styles from '../assets.module.css';

type Props = {
  variantName: string;
  variantPrompt: string;
  variantNegative: string;
  i2iStrength: number;
  onVariantNameChange: (v: string) => void;
  onVariantPromptChange: (v: string) => void;
  onVariantNegativeChange: (v: string) => void;
  onI2iStrengthChange: (v: number) => void;
  onGenerateVariant: () => void;
  onGenerateAllVariants: () => void;
  loading: boolean;
};

export default function VariantForm({
  variantName,
  variantPrompt,
  variantNegative,
  i2iStrength,
  onVariantNameChange,
  onVariantPromptChange,
  onVariantNegativeChange,
  onI2iStrengthChange,
  onGenerateVariant,
  onGenerateAllVariants,
  loading,
}: Props) {
  return (
    <div className={styles.formGroup}>
      <input
        value={variantName}
        onChange={e => onVariantNameChange(e.target.value)}
        placeholder="Variant Name (e.g. night)"
        className={styles.formInput}
      />
      <textarea
        value={variantPrompt}
        onChange={e => onVariantPromptChange(e.target.value)}
        placeholder="Variant Prompt Text"
        rows={2}
        className={styles.formInput}
      />
      <input
        value={variantNegative}
        onChange={e => onVariantNegativeChange(e.target.value)}
        placeholder="Negative Prompt (optional)"
        className={styles.formInput}
      />
      <div className={styles.sliderRow}>
        <label className={styles.sliderLabel}>i2i Strength: {i2iStrength.toFixed(2)}</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={i2iStrength}
          onChange={e => onI2iStrengthChange(parseFloat(e.target.value))}
          className={styles.sliderInput}
        />
      </div>
      <div className={styles.btnRow}>
        <button
          onClick={onGenerateVariant}
          disabled={loading}
          className={styles.btnPrimary}
        >
          Generate Variant
        </button>
        <button
          onClick={onGenerateAllVariants}
          disabled={loading}
          className={styles.btnSecondary}
        >
          Generate All Variants
        </button>
      </div>
    </div>
  );
}
