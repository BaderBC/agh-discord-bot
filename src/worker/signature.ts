function fromHex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
}

export async function verifyDiscordRequest(request: Request, body: string, publicKey: string): Promise<boolean> {
  const signature = request.headers.get('X-Signature-Ed25519') ?? '';
  const timestamp = request.headers.get('X-Signature-Timestamp') ?? '';
  if (!/^[\da-f]{64}$/i.test(publicKey) || !/^[\da-f]{128}$/i.test(signature) || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey('raw', fromHex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, fromHex(signature), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}
