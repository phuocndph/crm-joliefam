/** Cryptographically generated, never logged/persisted by this helper. */
export function generateLocalPassword(): string {
  const random = new Uint8Array(24);
  crypto.getRandomValues(random);
  return 'Aa1!' + Array.from(random, byte=>byte.toString(16).padStart(2,'0')).join('');
}
