import { Suspense } from 'react';
import type { Metadata } from 'next';
import AuthForm from '@/components/AuthForm';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <div className="container container--narrow auth">
      <Suspense fallback={<div className="card skeleton" style={{ height: 330 }} />}>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
