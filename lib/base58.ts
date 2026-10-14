/**
 * Minimal base58 (Bitcoin alphabet) codec — dependency-free and safe to import
 * from the browser bundle. Used to transport Solana public keys and ed25519
 * message signatures; imported by both the seal verifier (server) and the
 * wallet signer (client).
 */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < BASE58_ALPHABET.length; i++) m.set(BASE58_ALPHABET[i], i);
  return m;
})();

export function base58Decode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  const bytes: number[] = [];
  for (const ch of input) {
    const value = BASE58_MAP.get(ch);
    if (value === undefined) throw new Error(`base58: invalid character "${ch}"`);
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1's are leading zero bytes.
  for (let i = 0; i < input.length && input[i] === "1"; i++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  // Drop most-significant zero digits so an all-zero payload emits only its
  // leading-'1' markers.
  while (digits.length > 0 && digits[digits.length - 1] === 0) digits.pop();
  let out = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}
