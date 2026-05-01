"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ClerkProvider, UserButton, useAuth, useUser } from "@clerk/nextjs";

interface HandleAuthValue {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
}

interface HandleUserValue {
  user: {
    firstName?: string | null;
    fullName?: string | null;
    username?: string | null;
  } | null;
}

const HandleAuthContext = createContext<HandleAuthValue | null>(null);
const HandleUserContext = createContext<HandleUserValue | null>(null);
const testAuthBypassEnabled =
  process.env.NEXT_PUBLIC_HANDLE_TEST_AUTH_BYPASS === "1";
const testUser = {
  firstName: "Smoke",
  fullName: "Smoke User",
  username: "smoke-user",
};

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const { user } = useUser();
  const authValue = useMemo<HandleAuthValue>(
    () => ({ getToken, isLoaded }),
    [getToken, isLoaded],
  );
  const userValue = useMemo<HandleUserValue>(
    () => ({ user: user ?? null }),
    [user],
  );

  return (
    <HandleAuthContext.Provider value={authValue}>
      <HandleUserContext.Provider value={userValue}>
        {children}
      </HandleUserContext.Provider>
    </HandleAuthContext.Provider>
  );
}

export function HandleAuthProvider({
  children,
  signInUrl,
  signUpUrl,
}: {
  children: ReactNode;
  signInUrl: string;
  signUpUrl: string;
}) {
  if (testAuthBypassEnabled) {
    return (
      <HandleAuthContext.Provider
        value={{ getToken: async () => "test-key-not-real", isLoaded: true }}
      >
        <HandleUserContext.Provider value={{ user: testUser }}>
          {children}
        </HandleUserContext.Provider>
      </HandleAuthContext.Provider>
    );
  }

  return (
    <ClerkProvider signInUrl={signInUrl} signUpUrl={signUpUrl}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

export function useHandleAuth() {
  const value = useContext(HandleAuthContext);
  if (!value) {
    throw new Error("useHandleAuth must be used inside HandleAuthProvider");
  }

  return value;
}

export function useHandleUser() {
  const value = useContext(HandleUserContext);
  if (!value) {
    throw new Error("useHandleUser must be used inside HandleAuthProvider");
  }

  return value;
}

export function HandleUserButton() {
  if (testAuthBypassEnabled) {
    return (
      <div
        aria-label="Smoke user"
        className="flex h-8 w-8 items-center justify-center rounded-pill bg-bg-subtle text-[12px] font-medium text-text-primary"
      >
        S
      </div>
    );
  }

  return <UserButton />;
}
