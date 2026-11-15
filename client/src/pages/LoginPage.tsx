import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AuthCard } from '../components/AuthCard';
import { Button } from '../components/Button';
import { Message } from '../components/Message';
import { PageHeader } from '../components/PageHeader';
import { TextField } from '../components/TextField';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { validateLoginEmail, validateLoginPassword } from '../lib/validation';

type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const validators: Record<Field, (value: string) => string | undefined> = {
  email: validateLoginEmail,
  password: validateLoginPassword,
};

/** Sign in (DESIGN.md §5.2). Once the session starts, RedirectIfSignedIn moves the user on. */
export function LoginPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ title: string; text: string } | null>(null);
  const refs = { email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
  const failureRef = useRef<HTMLDivElement>(null);

  // After the user's own action fails, focus moves to the message (DESIGN.md §7).
  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  // Validate on submit, then on blur once the user has tried to submit; never on every keystroke.
  function handleBlur(field: Field) {
    if (!submitted) return;
    setErrors((current) => ({ ...current, [field]: validators[field](values[field]) }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitted(true);
    setFailure(null);

    const found: FieldErrors = {
      email: validators.email(values.email),
      password: validators.password(values.password),
    };
    setErrors(found);
    const firstInvalid = (['email', 'password'] as const).find((field) => found[field]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await signIn(values.email, values.password);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setFailure({ title: error.message, text: 'Check your details and try again.' });
      } else if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
        setFailure({ title: 'Too many sign-in attempts', text: `For safety, signing in is paused from this connection. Try again in ${error.waitPhrase}.` });
      } else {
        setFailure({ title: "We couldn't sign you in", text: 'Check your connection and try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard>
      <PageHeader title="Sign in" className="mb-4" />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {failure ? (
          <Message ref={failureRef} variant="danger" title={failure.title}>
            {failure.text}
          </Message>
        ) : null}
        <TextField
          ref={refs.email}
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          value={values.email}
          onChange={(event) => update('email', event.target.value)}
          onBlur={() => handleBlur('email')}
          error={errors.email}
        />
        <TextField
          ref={refs.password}
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(event) => update('password', event.target.value)}
          onBlur={() => handleBlur('password')}
          error={errors.password}
        />
        <Button type="submit" fullWidth loading={submitting} loadingLabel="Signing in…">
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-center text-copy-14 text-fg-secondary">
        New to SlotBook?{' '}
        <Link to="/register" state={location.state} className="text-accent underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
