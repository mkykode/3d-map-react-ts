export interface VirtualInputFixture {
  byteLength: number;
  chunks(): AsyncIterable<Uint8Array>;
}

export function makeOversizedInputFixture(
  byteLength: number,
  chunkSize = 64 * 1024,
): VirtualInputFixture {
  return {
    byteLength,
    async *chunks() {
      let remaining = byteLength;
      while (remaining > 0) {
        const length = Math.min(remaining, chunkSize);
        yield new Uint8Array(length).fill(0x20);
        remaining -= length;
      }
    },
  };
}

export async function makeCompressionBombFixture(
  decompressedBytes = 2 * 1024 * 1024,
): Promise<{ compressed: Uint8Array; decompressedBytes: number }> {
  const payload = new Uint8Array(decompressedBytes).fill(0x41);
  const stream = new Blob([payload])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return {
    compressed,
    decompressedBytes,
  };
}

export function makeTraversalFixtures(): readonly string[] {
  return [
    "../secret.ts",
    "../../outside/source.ts",
    "%2e%2e/%2e%2e/private.ts",
    "file:///tmp/outside.ts",
  ];
}

export function makeMalformedPayloadFixtures(): readonly Uint8Array[] {
  const encode = (value: string) => new TextEncoder().encode(value);
  return [
    encode(""),
    encode("not-json"),
    encode("{}"),
    encode('{"traceEvents":null}'),
    encode('{"traceEvents":['),
  ];
}
