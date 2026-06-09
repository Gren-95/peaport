import LoginForm from './LoginForm';

// Render dynamically so the per-request CSP nonce is applied to scripts.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginForm />;
}
