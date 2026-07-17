interface PromotionStatus {
  contentPath: string;
  name: string;
  stages: {
    dev?: { url: string };
    staging?: { url: string };
    production?: { url: string };
  };
}

interface PromotionRowProps {
  status: PromotionStatus;
  disabled?: boolean;
  onPromoteStaging: (contentPath: string) => void;
  onPromoteProduction: (contentPath: string) => void;
  onRollbackStaging: (contentPath: string) => void;
}

export default function PromotionRow({ status, disabled, onPromoteStaging, onPromoteProduction, onRollbackStaging }: PromotionRowProps) {
  const hasDev = !!status.stages?.dev;
  const hasStaging = !!status.stages?.staging;
  const hasProduction = !!status.stages?.production;

  return (
    <tr>
      <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{status.name}</td>
      <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
        {hasDev ? (
          <span style={{ background: '#d4edda', color: '#155724', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
            dev
          </span>
        ) : (
          <span style={{ color: '#888' }}>—</span>
        )}
      </td>
      <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
        {hasStaging ? (
          <span style={{ background: '#fff3cd', color: '#856404', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
            staging
          </span>
        ) : hasDev ? (
          <button
            onClick={() => onPromoteStaging(status.contentPath)}
            disabled={disabled}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            Promote to Staging
          </button>
        ) : (
          <span style={{ color: '#888' }}>—</span>
        )}
      </td>
      <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
        {hasProduction ? (
          <span style={{ background: '#d1ecf1', color: '#0c5460', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
            production
          </span>
        ) : hasStaging ? (
          <button
            onClick={() => onPromoteProduction(status.contentPath)}
            disabled={disabled}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            Promote to Production
          </button>
        ) : (
          <span style={{ color: '#888' }}>—</span>
        )}
      </td>
      <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
        {hasStaging && (
          <button
            onClick={() => onRollbackStaging(status.contentPath)}
            disabled={disabled}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', cursor: disabled ? 'not-allowed' : 'pointer', color: '#c00' }}
          >
            Rollback
          </button>
        )}
      </td>
    </tr>
  );
}
