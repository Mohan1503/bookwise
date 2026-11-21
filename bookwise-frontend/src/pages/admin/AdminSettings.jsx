import { CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useApiData from '../../hooks/useApiData';
import { getAdminSettings } from '../../services/api';

function minutesToText(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  return `${minutes} minutes`;
}

export default function AdminSettings() {
  const { user } = useAuth();
  const system = useApiData(getAdminSettings);
  const settings = system.data;

  return (
    <div className="admin-page">
      <div className="admin-page__intro">
        <p className="admin-page__lead">Your account and the server settings that affect the catalogue. Server values are read-only here; change them in the backend <code>.env</code> and restart.</p>
      </div>

      {system.error ? <p className="admin-alert admin-alert--error" role="alert">{system.error}</p> : null}

      <div className="admin-settings">
        <section className="panel admin-card">
          <h2 className="admin-card__title">Your account</h2>
          <dl className="admin-dl">
            <div><dt>Name</dt><dd>{user?.name}</dd></div>
            <div><dt>Email</dt><dd>{user?.email}</dd></div>
            <div><dt>Role</dt><dd>{(user?.roles ?? []).join(', ') || '—'}</dd></div>
          </dl>
        </section>

        <section className="panel admin-card">
          <h2 className="admin-card__title">Uploads and storage</h2>
          {settings ? (
            <dl className="admin-dl">
              <div>
                <dt>File uploads</dt>
                <dd className={settings.uploads_enabled ? 'admin-ok' : 'admin-off'}>
                  {settings.uploads_enabled ? <CheckCircle2 size={15} aria-hidden="true" /> : <XCircle size={15} aria-hidden="true" />}
                  {settings.uploads_enabled ? 'Enabled' : 'Disabled'} <code>ADMIN_UPLOADS_ENABLED</code>
                </dd>
              </div>
              <div><dt>Storage provider</dt><dd>{settings.storage_provider} <code>STORAGE_PROVIDER</code></dd></div>
              <div><dt>Maximum file size</dt><dd>{settings.max_upload_size_mb} MB <code>MAX_UPLOAD_SIZE_MB</code></dd></div>
              <div><dt>Cover formats</dt><dd>{settings.allowed_cover_extensions.join(', ')}</dd></div>
              <div><dt>Book file formats</dt><dd>{settings.allowed_book_extensions.join(', ')}</dd></div>
            </dl>
          ) : <p className="muted">Loading…</p>}
        </section>

        <section className="panel admin-card">
          <h2 className="admin-card__title">Server</h2>
          {settings ? (
            <dl className="admin-dl">
              <div><dt>Environment</dt><dd>{settings.environment} <code>ENVIRONMENT</code></dd></div>
              <div><dt>Sign-in lasts</dt><dd>{minutesToText(settings.access_token_expire_minutes)} <code>ACCESS_TOKEN_EXPIRE_MINUTES</code></dd></div>
            </dl>
          ) : <p className="muted">Loading…</p>}
        </section>
      </div>
    </div>
  );
}
