import { Suspense } from 'react';
import type { Metadata } from 'next';
import AuthForm from '@/components/AuthForm';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <div className="container container--narrow auth">
      <Suspense fallback={<div className="card skeleton" style={{ height: 400 }} />}>
        <AuthForm mode="register" />
      </Suspense>
    </div>
  );
}
