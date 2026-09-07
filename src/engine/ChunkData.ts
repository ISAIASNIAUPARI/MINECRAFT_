import { CHUNK_VOLUME } from '../core/constants';
import { localBlockIndex } from '../core/math';
import type { BlockId } from '../core/types';
import type { IChunkData } from './types';

/**
 * Dense block storage: one `Uint16Array` of {@link CHUNK_VOLUME} entries.
 *
 * Phase 4 can swap in a palette-backed implementation behind {@link IChunkData}
 * without touching callers; the `array` accessor stays the serialization format.
 */
export class ChunkData implements IChunkData {
  readonly array: Uint16Array;
  private nonAir = 0;

  constructor(source?: Uint16Array) {
    if (source) {
      if (source.length !== CHUNK_VOLUME) {
        throw new Error(`ChunkData: expected ${CHUNK_VOLUME} entries, got ${source.length}`);
      }
      this.array = source;
      for (let i = 0; i < source.length; i++) if (source[i] !== 0) this.nonAir++;
    } else {
      this.array = new Uint16Array(CHUNK_VOLUME);
    }
  }

  get(lx: number, ly: number, lz: number): BlockId {
    return this.array[localBlockIndex(lx, ly, lz)];
  }

  set(lx: number, ly: number, lz: number, id: BlockId): void {
    this.setByIndex(localBlockIndex(lx, ly, lz), id);
  }

  getByIndex(index: number): BlockId {
    return this.array[index];
  }

  setByIndex(index: number, id: BlockId): void {
    const prev = this.array[index];
    if (prev === id) return;
    if (prev === 0) this.nonAir++;
    else if (id === 0) this.nonAir--;
    this.array[index] = id;
  }

  fill(id: BlockId): void {
    this.array.fill(id);
    this.nonAir = id === 0 ? 0 : CHUNK_VOLUME;
  }

  isUniform(): boolean {
    return this.nonAir === 0 || this.nonAir === CHUNK_VOLUME;
  }

  uniformValue(): BlockId | null {
    if (this.nonAir === 0) return 0;
    if (this.nonAir === CHUNK_VOLUME) {
      const first = this.array[0];
      for (let i = 1; i < CHUNK_VOLUME; i++) if (this.array[i] !== first) return null;
      return first;
    }
    return null;
  }

  clone(): ChunkData {
    return new ChunkData(this.array.slice());
  }
}
