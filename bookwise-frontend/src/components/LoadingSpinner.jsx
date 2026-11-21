import './LoadingSpinner.css';

/**
 * Accessible loading indicator.
 * Rendered with `span` elements so it can be used inside buttons.
 */
export default function LoadingSpinner({ label = 'Loading…', size = 'md', inline = false }) {
  return (
    <span
      className={`loading ${inline ? 'loading--inline' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`spinner loading__spinner loading__spinner--${size}`}
        aria-hidden="true"
      />
      <span className="loading__label">{label}</span>
    </span>
  );
}
