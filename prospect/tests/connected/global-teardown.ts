export default async function globalTeardown() {
  const stub = (globalThis as { __stub?: { close: () => Promise<void> } }).__stub;
  await stub?.close();
}
