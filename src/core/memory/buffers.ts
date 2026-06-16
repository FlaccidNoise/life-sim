export type TypedArrayCtor =
  | Float64ArrayConstructor
  | Float32ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Uint16ArrayConstructor
  | Uint8ArrayConstructor;

export type TypedArray =
  | Float64Array
  | Float32Array
  | Uint32Array
  | Int32Array
  | Uint16Array
  | Uint8Array;

export interface FieldSpec {
  readonly name: string;
  readonly ctor: TypedArrayCtor;
}

/**
 * True when SharedArrayBuffer is usable: it exists, and we are either in Node
 * (crossOriginIsolated undefined) or a cross-origin-isolated browser context.
 */
export function supportsSharedMemory(): boolean {
  if (typeof SharedArrayBuffer === 'undefined') return false;
  const coi = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
  return coi === undefined || coi === true;
}

export interface SoaLayout<K extends string> {
  readonly buffer: ArrayBufferLike;
  readonly fields: Readonly<Record<K, TypedArray>>;
  readonly capacity: number;
  readonly shared: boolean;
}

// A typed-array constructor narrowed to the (buffer, byteOffset, length) overload,
// so we can `new` it without TypeScript's union-of-constructors limitation.
type ViewCtor = new (buffer: ArrayBufferLike, byteOffset: number, length: number) => TypedArray;

/**
 * Allocate a struct-of-arrays layout: every field is a typed array of `capacity`
 * elements, all sharing ONE backing buffer (byteOffset views). The buffer is a
 * SharedArrayBuffer when `preferShared` and the environment supports it,
 * otherwise a plain ArrayBuffer (identical typed-array semantics either way).
 */
export function allocateSoa<K extends string>(
  specs: readonly (FieldSpec & { name: K })[],
  capacity: number,
  preferShared = true,
): SoaLayout<K> {
  let offset = 0;
  const plans: { name: K; ctor: TypedArrayCtor; offset: number }[] = [];
  for (const spec of specs) {
    const bpe = spec.ctor.BYTES_PER_ELEMENT;
    if (offset % bpe !== 0) offset += bpe - (offset % bpe);
    plans.push({ name: spec.name, ctor: spec.ctor, offset });
    offset += bpe * capacity;
  }

  const shared = preferShared && supportsSharedMemory();
  const buffer: ArrayBufferLike = shared ? new SharedArrayBuffer(offset) : new ArrayBuffer(offset);

  const fields = {} as Record<K, TypedArray>;
  for (const p of plans) {
    const Ctor = p.ctor as ViewCtor;
    fields[p.name] = new Ctor(buffer, p.offset, capacity);
  }

  return { buffer, fields, capacity, shared };
}
