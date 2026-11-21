import { Eye, EyeOff } from 'lucide-react';

const LABELS = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' };

/** Status badge; flags books that are published but still private (not in the store). */
export default function StatusPill({ book }) {
  const status = book?.status ?? 'DRAFT';
  const isLive = status === 'PUBLISHED' && book?.visibility === 'PUBLIC';
  return (
    <span className="admin-status-wrap">
      <span className={`admin-status admin-status--${status.toLowerCase()}`}>{LABELS[status] ?? status}</span>
      {status === 'PUBLISHED' ? (
        <span className={`admin-visibility${isLive ? '' : ' admin-visibility--private'}`} title={isLive ? 'Visible in the store' : 'Private: hidden from the store'}>
          {isLive ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
          <span className="sr-only">{isLive ? 'Visible in the store' : 'Private: hidden from the store'}</span>
        </span>
      ) : null}
    </span>
  );
}
