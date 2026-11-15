import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AuthCard } from '../components/AuthCard';
import { Button } from '../components/Button';
import { Message } from '../components/Message';
import { PageHeader } from '../components/PageHeader';
import { TextField } from '../components/TextField';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { validateEmail, validateName, validateNewPassword } from '../lib/validation';

type Field = 'name' | 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: readonly Field[] = ['name', 'email', 'password'];
const validators: Record<Field, (value: string) => string | undefined> = {
  name: validateName,
  email: validateEmail,
  password: validateNewPassword,
};

/** Create account (DESIGN.md §5.2). Registration always creates a member; the form has no role. */
export function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ title: string; text: string } | null>(null);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };
  const failureRef = useRef<HTMLDivElement>(null);

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

  function showFieldErrors(found: FieldErrors) {
    setErrors(found);
    const firstInvalid = FIELDS.find((field) => found[field]);
    if (firstInvalid) refs[firstInvalid].current?.focus();
    return Boolean(firstInvalid);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitted(true);
    setFailure(null);

    const found: FieldErrors = {};
    for (const field of FIELDS) found[field] = validators[field](values[field]);
    if (showFieldErrors(found)) return;

    setSubmitting(true);
    try {
      await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        showFieldErrors({ email: 'An account with this email already exists. Sign in instead.' });
      } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && Object.keys(error.fields).length > 0) {
        const fromServer: FieldErrors = {};
        for (const field of FIELDS) fromServer[field] = error.fields[field];
        showFieldErrors(fromServer);
      } else if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
        setFailure({ title: 'Too many attempts to create an account', text: `For safety, creating accounts is paused from this connection. Try again in ${error.waitPhrase}.` });
      } else {
        setFailure({ title: "We couldn't create your account", text: 'Check your connection and try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard>
      <PageHeader title="Create an account" className="mb-4" />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {failure ? (
          <Message ref={failureRef} variant="danger" title={failure.title}>
            {failure.text}
          </Message>
        ) : null}
        <TextField
          ref={refs.name}
          label="Name"
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          onBlur={() => handleBlur('name')}
          error={errors.name}
        />
        <TextField
          ref={refs.email}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
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
          autoComplete="new-password"
          caption="At least 8 characters"
          value={values.password}
          onChange={(event) => update('password', event.target.value)}
          onBlur={() => handleBlur('password')}
          error={errors.password}
        />
        <Button type="submit" fullWidth loading={submitting} loadingLabel="Creating account…">
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-copy-14 text-fg-secondary">
        Already have an account?{' '}
        <Link to="/login" state={location.state} className="text-accent underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
