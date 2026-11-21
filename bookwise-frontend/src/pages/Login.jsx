import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import './Auth.css';

export default function Login({ adminOnly = false }) {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  const [form, setForm] = useState({
    email: '',
    password: '',
    remember: true,
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const [showPassword, setShowPassword] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function validate() {
    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      nextErrors.email = 'Enter a valid email address.';
    if (!form.password) nextErrors.password = 'Password is required.';
    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    setStatus('loading');
    const result = await login({
      email: form.email,
      password: form.password,
      remember: form.remember,
    });

    if (!result.success) {
      setErrors({ form: result.error });
      setStatus('error');
      return;
    }

    if (adminOnly && !result.user.roles?.includes('superadmin')) {
      logout();
      setErrors({ form: 'This account does not have superadmin access.' });
      setStatus('error');
      return;
    }

    setStatus('success');
    navigate(returnTo || (adminOnly ? '/admin' : '/'), { replace: true });
  }

  return (
    <div className="auth-card">
      <header className="auth-card__header">
        <h1 className="auth-card__title">{adminOnly ? 'Superadmin sign in' : 'Welcome back'}</h1>
        <p className="auth-card__subtitle">
          {adminOnly
            ? 'Sign in with your BookWise superadmin account to manage the catalogue.'
            : 'Sign in to reach your wishlist, cart and AI Reader session.'}
        </p>
      </header>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {errors.form ? (
          <div className="auth-alert auth-alert--error" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <span>{errors.form}</span>
          </div>
        ) : null}

        <div className="field">
          <label className="field__label" htmlFor="login-email">
            Email address
          </label>
          <div className="auth-input">
            <Mail size={17} aria-hidden="true" />
            <input
              id="login-email"
              type="email"
              className={errors.email ? 'input input--error' : 'input'}
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
          </div>
          {errors.email ? (
            <p className="field__error" id="login-email-error">
              <AlertCircle size={14} aria-hidden="true" />
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="login-password">
            Password
          </label>
          <div className="auth-input">
            <Lock size={17} aria-hidden="true" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              className={errors.password ? 'input input--error' : 'input'}
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
            />
            <button
              type="button"
              className="auth-input__toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff size={17} aria-hidden="true" />
              ) : (
                <Eye size={17} aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.password ? (
            <p className="field__error" id="login-password-error">
              <AlertCircle size={14} aria-hidden="true" />
              {errors.password}
            </p>
          ) : null}
        </div>

        <div className="auth-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.remember}
              onChange={(event) => updateField('remember', event.target.checked)}
            />
            <span>Remember me</span>
          </label>

          <span className="auth-link">Forgot password?</span>
        </div>

        <button
          type="submit"
          className="btn btn--primary btn--block btn--lg"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <>
              <LoadingSpinner label="Signing in…" inline size="sm" />
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {adminOnly ? null : (
        <p className="auth-card__switch">
          New to BookWise? <Link to="/signup">Create an account</Link>
        </p>
      )}
    </div>
  );
}
