import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
