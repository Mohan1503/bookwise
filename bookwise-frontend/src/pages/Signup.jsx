import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import './Auth.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    terms: false,
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

    if (!form.name.trim()) nextErrors.name = 'Full name is required.';
    else if (form.name.trim().length < 2) nextErrors.name = 'Please enter your full name.';

    if (!form.email.trim()) nextErrors.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(form.email.trim()))
      nextErrors.email = 'Enter a valid email address.';

    if (!form.password) nextErrors.password = 'Password is required.';
    else if (form.password.length < 8)
      nextErrors.password = 'Password must be at least 8 characters long.';

    if (!form.confirmPassword) nextErrors.confirmPassword = 'Confirm your password.';
    else if (form.password !== form.confirmPassword)
      nextErrors.confirmPassword = 'Passwords do not match.';

    if (!form.terms) nextErrors.terms = 'Please accept the terms to continue.';

    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    setStatus('loading');

    const result = await signup({
      name: form.name,
      email: form.email,
      password: form.password,
      confirmPassword: form.confirmPassword,
      acceptTerms: form.terms,
      remember: true,
    });

    if (!result.success) {
      setErrors({ form: result.error });
      setStatus('error');
      return;
    }

    setStatus('success');
    navigate('/', { replace: true });
  }

  const passwordStrength = (() => {
    const value = form.password;
    if (!value) return null;
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
    if (/\d/.test(value) || /[^\w\s]/.test(value)) score += 1;
    return score;
  })();

  return (
    <div className="auth-card">
      <header className="auth-card__header">
        <h1 className="auth-card__title">Create your account</h1>
        <p className="auth-card__subtitle">
          It takes a minute.           Your account is securely stored with BookWise.
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
          <label className="field__label" htmlFor="signup-name">
            Full name
          </label>
          <div className="auth-input">
            <User size={17} aria-hidden="true" />
            <input
              id="signup-name"
              type="text"
              className={errors.name ? 'input input--error' : 'input'}
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'signup-name-error' : undefined}
            />
          </div>
          {errors.name ? (
            <p className="field__error" id="signup-name-error">
              <AlertCircle size={14} aria-hidden="true" />
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="signup-email">
            Email address
          </label>
          <div className="auth-input">
            <Mail size={17} aria-hidden="true" />
            <input
              id="signup-email"
              type="email"
              className={errors.email ? 'input input--error' : 'input'}
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'signup-email-error' : undefined}
            />
          </div>
          {errors.email ? (
            <p className="field__error" id="signup-email-error">
              <AlertCircle size={14} aria-hidden="true" />
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="signup-password">
            Password
          </label>
          <div className="auth-input">
            <Lock size={17} aria-hidden="true" />
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              className={errors.password ? 'input input--error' : 'input'}
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'signup-password-error' : 'signup-password-hint'}
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
            <p className="field__error" id="signup-password-error">
              <AlertCircle size={14} aria-hidden="true" />
              {errors.password}
            </p>
          ) : (
            <p className="field__hint" id="signup-password-hint">
              Use at least 8 characters. A mix of letters and numbers works best.
            </p>
          )}
          {passwordStrength !== null ? (
            <div className="strength" aria-hidden="true">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={
                    step <= passwordStrength
                      ? 'strength__bar strength__bar--on'
                      : 'strength__bar'
                  }
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="signup-confirm">
            Confirm password
          </label>
          <div className="auth-input">
            <Lock size={17} aria-hidden="true" />
            <input
              id="signup-confirm"
              type={showPassword ? 'text' : 'password'}
              className={errors.confirmPassword ? 'input input--error' : 'input'}
              value={form.confirmPassword}
              onChange={(event) => updateField('confirmPassword', event.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={
                errors.confirmPassword ? 'signup-confirm-error' : undefined
              }
            />
          </div>
          {errors.confirmPassword ? (
            <p className="field__error" id="signup-confirm-error">
              <AlertCircle size={14} aria-hidden="true" />
              {errors.confirmPassword}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.terms}
              onChange={(event) => updateField('terms', event.target.checked)}
              aria-invalid={Boolean(errors.terms)}
              aria-describedby={errors.terms ? 'signup-terms-error' : undefined}
            />
            <span>
              I agree to the BookWise terms of service and privacy policy.
            </span>
          </label>
          {errors.terms ? (
            <p className="field__error" id="signup-terms-error">
              <AlertCircle size={14} aria-hidden="true" />
              {errors.terms}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className="btn btn--primary btn--block btn--lg"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <LoadingSpinner label="Creating account…" inline size="sm" />
          ) : (
            <>
              <CheckCircle2 size={17} aria-hidden="true" />
              Create account
            </>
          )}
        </button>

      </form>

      <p className="auth-card__switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
