"use client";

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px', marginBottom: '1rem' }}>
      <input
        value={variantName}
        onChange={e => onVariantNameChange(e.target.value)}
        placeholder="Variant Name (e.g. night)"
        style={{ padding: '0.5rem', background: '#0d0d1a', color: '#00ff00', border: '1px solid #00ff00' }}
      />
      <textarea
        value={variantPrompt}
        onChange={e => onVariantPromptChange(e.target.value)}
        placeholder="Variant Prompt Text"
        rows={2}
        style={{ padding: '0.5rem', background: '#0d0d1a', color: '#00ff00', border: '1px solid #00ff00' }}
      />
      <input
        value={variantNegative}
        onChange={e => onVariantNegativeChange(e.target.value)}
        placeholder="Negative Prompt (optional)"
        style={{ padding: '0.5rem', background: '#0d0d1a', color: '#00ff00', border: '1px solid #00ff00' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <label style={{ color: '#00ff00' }}>i2i Strength: {i2iStrength.toFixed(2)}</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={i2iStrength}
          onChange={e => onI2iStrengthChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
      </div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={onGenerateVariant}
          disabled={loading}
          style={{ padding: '0.75rem 1.5rem', background: '#00ff00', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
        >
          Generate Variant
        </button>
        <button
          onClick={onGenerateAllVariants}
          disabled={loading}
          style={{ padding: '0.75rem 1.5rem', background: '#00aaff', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
        >
          Generate All Variants
        </button>
      </div>
    </div>
  );
}
