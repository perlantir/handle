export function isHandleTestAuthBypassEnabled() {
  return (
    process.env.HANDLE_TEST_AUTH_BYPASS === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function getHandleServerToken() {
  if (isHandleTestAuthBypassEnabled()) {
    return "test-key-not-real";
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { getToken } = await auth();
  return getToken();
}
