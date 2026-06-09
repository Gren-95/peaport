import ChangePasswordForm from './ChangePasswordForm';

// Render dynamically so the per-request CSP nonce is applied to scripts.
export const dynamic = 'force-dynamic';

export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
