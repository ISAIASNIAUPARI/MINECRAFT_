import { chunkKey } from '../core/math';
import { chunkToWorldOrigin } from '../core/math';
import type { BlockId, ChunkPos, Vec3 } from '../core/types';
import { ChunkData } from './ChunkData';
import { ChunkStage, type IChunk, type IChunkData } from './types';

export class Chunk implements IChunk {
  readonly pos: ChunkPos;
  readonly key: string;
  readonly origin: Readonly<Vec3>;
  readonly data: IChunkData;

  stage: ChunkStage = ChunkStage.Empty;
  meshDirty = true;
  needsSave = false;

  private _revision = 0;

  constructor(cx: number, cy: number, cz: number, data?: IChunkData) {
    this.pos = { cx, cy, cz };
    this.key = chunkKey(cx, cy, cz);
    this.origin = {
      x: chunkToWorldOrigin(cx),
      y: chunkToWorldOrigin(cy),
      z: chunkToWorldOrigin(cz),
    };
    this.data = data ?? new ChunkData();
  }

  get revision(): number {
    return this._revision;
  }

  getBlock(lx: number, ly: number, lz: number): BlockId {
    return this.data.get(lx, ly, lz);
  }

  setBlock(lx: number, ly: number, lz: number, id: BlockId): boolean {
    const prev = this.data.get(lx, ly, lz);
    if (prev === id) return false;
    this.data.set(lx, ly, lz, id);
    this._revision++;
    this.meshDirty = true;
    this.needsSave = true;
    return true;
  }
}
