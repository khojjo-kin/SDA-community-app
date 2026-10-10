// The iPhone app reads files from the phone; in the browser every picked file is a blob: URL that
// fetch() can read, so this File reports nothing and api.ts falls back to fetch.
export class File {
  constructor(public uri: string) {}
  get size(): number {
    return sizes.get(this.uri) ?? 0;
  }
  async bytes(): Promise<Uint8Array> {
    throw new Error('read with fetch');
  }
}

const sizes = new Map<string, number>();
/** Remembers a picked file's size, so size checks in api.ts work for blob: URLs. */
export function rememberSize(uri: string, size: number) {
  sizes.set(uri, size);
}
