import { SignUp } from "@clerk/nextjs";
import { isHandleTestAuthBypassEnabled } from "@/lib/serverAuth";

export default function SignUpPage() {
  if (isHandleTestAuthBypassEnabled()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-canvas px-6 py-12">
        <a
          className="rounded-pill bg-bg-inverse px-5 py-3 text-[14px] font-medium text-text-onAccent"
          href="/"
        >
          Continue as smoke user
        </a>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-canvas px-6 py-12">
      <SignUp />
    </main>
  );
}
