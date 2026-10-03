import { CHUNK_SIZE, SEA_LEVEL, WORLD_MAX_Y } from '../core/constants';
import { worldToChunk } from '../core/math';
import { createLogger } from '../core/Logger';
import { GameMode, Difficulty } from '../core/types';
import { createGameContent, type GameContent } from '../content';
import { World } from '../engine/World';
import type { IChunk } from '../engine/types';
import { WorldGenerator, ChunkGeneratorAdapter } from '../world';
import { NaiveMesher, Renderer, TextureAtlas, collectTextureKeys } from '../rendering';
import type { ChunkMeshView } from '../rendering/types';
import { InputManager } from '../input/InputManager';
import { PlayerController } from '../player/PlayerController';
import { PlayerInventory } from '../inventory/PlayerInventory';
import { MemoryStorage } from '../storage/MemoryStorage';
import { EntityManager, EntityRenderer, type BrainSenses, type IEntity } from '../entities';
import { raycastVoxel } from '../physics/raycast';
import type { VoxelView } from '../physics/types';
import { normalizeSeed } from '../core/rng';
import { GameLoop } from './GameLoop';
import { GameBridgeImpl } from './GameBridgeImpl';
import type { DebugSnapshot, GameBridge, HudSnapshot, NewWorldOptions } from './types';

const logg = createLogger('game');
const REMESH_BUDGET_PER_TICK = 12;
const HUD_INTERVAL = 0.1;
const AUTOSAVE_INTERVAL = 30;
/** Kept small while chunk generation is synchronous; the engine agent raises this with the worker pool. */
const SKELETON_RENDER_DISTANCE = 5;
/** Fixed time of day until the day/night cycle lands (Phase 2). 0 = midnight. */
const TIME_OF_DAY = 0.32;

/**
 * The orchestrator. Owns the fixed-timestep loop and wires the subsystems
 * together. This file is the integration point maintained by the project lead;
 * subsystem agents work behind the module interfaces it consumes.
 */
export class Game {
  readonly bridge: GameBridgeImpl;
  private readonly input: InputManager;

  private canvas: HTMLCanvasElement | null = null;
  private loop: GameLoop | null = null;

  private content: GameContent | null = null;
  private world: World | null = null;
  private generator: WorldGenerator | null = null;
  private renderer: Renderer | null = null;
  private entities: EntityManager | null = null;
  private entityRenderer: EntityRenderer | null = null;
  private voxels: VoxelView | null = null;
  private canSee: BrainSenses['canSee'] | null = null;
  private elapsed = 0;
  private spawnCursor = 0;
  private player: PlayerController | null = null;
  private inventory: PlayerInventory | null = null;
  private storage: MemoryStorage | null = null;
  private readonly mesher = new NaiveMesher();
  private atlas: TextureAtlas | null = null;

  private readonly dirtyChunks = new Set<string>();
  private paused = false;
  private worldTimeTicks = 0;
  private hudTimer = 0;
  private saveTimer = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    this.input = new InputManager();
    this.bridge = new GameBridgeImpl(
      {
        attachCanvas: (c) => this.attachCanvas(c),
        startNewWorld: (o) => this.startNewWorld(o),
        resumeWorld: (id) => this.resumeWorld(id),
        pause: () => this.pause(),
        resume: () => this.resume(),
        exitToMenu: () => this.exitToMenu(),
        toggleDebug: () => this.toggleDebug(),
        toggleInventory: () => this.toggleInventory(),
        saveNow: () => this.save(),
      },
      this.input,
    );
  }

  getBridge(): GameBridge {
    return this.bridge;
  }

  private attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  async startNewWorld(options: NewWorldOptions): Promise<void> {
    if (!this.canvas) throw new Error('Game.startNewWorld: canvas not attached');
    this.bridge.setSnapshot({ phase: 'loading', loading: { label: 'Preparing world', progress: 0.05 }, error: null });

    try {
      const seed = normalizeSeed(options.seed || String(Date.now()));
      this.content = createGameContent();
      const { blocks } = this.content;

      this.bridge.setSnapshot({ loading: { label: 'Generating terrain', progress: 0.2 } });
      this.generator = new WorldGenerator(seed, blocks, this.content.biomes);
      const adapter = new ChunkGeneratorAdapter(this.generator);

      this.storage = new MemoryStorage(`world-${seed}`);
      this.world = new World({
        seed,
        generator: adapter,
        renderDistance: SKELETON_RENDER_DISTANCE,
        onChunkReady: (chunk) => this.dirtyChunks.add(chunk.key),
        onChunkUnload: (chunk) => {
          this.dirtyChunks.delete(chunk.key);
          this.renderer?.removeChunkMesh(chunk.pos.cx, chunk.pos.cy, chunk.pos.cz);
        },
      });

      // Spawn: surface at origin.
      const column = this.generator.sampleColumn(0, 0);
      const spawnY = Math.max(column.surfaceY, SEA_LEVEL) + 2;
      const spawnPos = { x: 0.5, y: Math.min(spawnY, WORLD_MAX_Y - 3), z: 0.5 };

      this.bridge.setSnapshot({ loading: { label: 'Loading chunks', progress: 0.4 } });
      this.world.ensureSpawnArea({ cx: 0, cy: 0, cz: 0 }, 3);

      this.bridge.setSnapshot({ loading: { label: 'Building meshes', progress: 0.65 } });
      this.atlas = new TextureAtlas(collectTextureKeys([...blocks.all]));
      this.renderer = new Renderer(this.canvas, this.atlas, blocks);
      this.syncCanvasSize();
      this.installResizeObserver();
      this.flushRemesh(200, spawnPos);

      this.inventory = new PlayerInventory(this.content.items, this.content.stackOps);
      this.grantStarterKit(options.gameMode);

      this.player = new PlayerController(
        this.world,
        this.input,
        blocks,
        { position: spawnPos, gameMode: options.gameMode },
        (x, y, z) => this.markAround(x, y, z),
        () => this.heldPlaceableBlock(),
        (x, y, z, id) => this.onBlockBroken(x, y, z, id, options.gameMode),
      );

      // --- entities ----------------------------------------------------
      const world = this.world;
      const blockReg = blocks;
      const voxels = {
        getBlock: (x: number, y: number, z: number) => world.getBlock(x, y, z),
        isSolid: (x: number, y: number, z: number) => blockReg.isSolid(world.getBlock(x, y, z)),
      };
      this.voxels = voxels;
      this.canSee = (from, to, maxDistance) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) return true;
        if (len > maxDistance) return false;
        const hit = raycastVoxel(
          voxels,
          from,
          { x: dx / len, y: dy / len, z: dz / len },
          len,
          (id) => blockReg.isSolid(id),
        );
        return hit === null;
      };

      this.entities = new EntityManager({
        registry: this.content.creatures,
        seed,
        onDeath: (entity) => this.onEntityDeath(entity),
        onAttackPlayer: (_entity, damage) => this.player?.hurt(damage),
      });
      this.entityRenderer = new EntityRenderer(this.renderer.threeScene);

      this.input.attach(this.canvas);
      this.input.load();
      this.input.setEnabled(true);

      this.loop = new GameLoop({
        update: (dt) => this.update(dt),
        render: (alpha) => this.render(alpha),
      });
      this.paused = false;
      this.loop.start();

      logg.info(`world "${options.name}" started (seed ${seed})`);
      this.bridge.setSnapshot({
        phase: 'playing',
        worldName: options.name,
        loading: null,
        inventoryOpen: false,
      });
      this.pushHud(true);
    } catch (err) {
      logg.error('failed to start world', err);
      this.bridge.setSnapshot({ phase: 'error', error: String(err), loading: null });
    }
  }

  async resumeWorld(_worldId: string): Promise<void> {
    // Phase 2 (Agent: engine/storage): rehydrate from IndexedDB. For now behaves
    // like a fresh world so the flow is exercised end to end.
    this.bridge.setSnapshot({ phase: 'menu' });
  }

  private update(dt: number): void {
    this.handleGlobalKeys();
    if (this.paused || !this.player || !this.world) return;

    // Hotbar selection.
    const wheel = this.input.readWheel();
    if (wheel !== 0 && this.inventory) {
      this.inventory.scrollHotbar(wheel);
      this.player.state.selectedSlot = this.inventory.selectedSlot;
    }
    for (let i = 1; i <= 9; i++) {
      if (this.input.consumePressed(`hotbar_${i}` as never) && this.inventory) {
        this.inventory.selectedSlot = i - 1;
        this.player.state.selectedSlot = i - 1;
      }
    }

    this.player.tick(dt);
    this.world.tick(dt);
    this.worldTimeTicks++;
    this.elapsed += dt;

    if (this.entities && this.voxels && this.canSee) {
      const p = this.player.state;
      this.entities.tick({
        dt,
        senses: {
          voxels: this.voxels,
          // Yaw rides along so freeze-when-watched brains can test the sight cone.
          playerPosition: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw },
          lightAt: (x, y, z) => this.skyLightAt(x, y, z),
          canSee: this.canSee,
          elapsed: this.elapsed,
          timeOfDay: TIME_OF_DAY,
        },
      });
    }

    const p = this.player.state.position;
    this.world.update({ cx: worldToChunk(p.x), cy: worldToChunk(p.y), cz: worldToChunk(p.z) });
    this.processRemesh(REMESH_BUDGET_PER_TICK);

    this.saveTimer += dt;
    if (this.saveTimer >= AUTOSAVE_INTERVAL) {
      this.saveTimer = 0;
      void this.save();
    }

    this.input.endFrame();
  }

  private render(alpha: number): void {
    if (!this.renderer || !this.player) return;
    this.player.updateLook(alpha);
    this.renderer.setCamera(this.player.getCameraState());
    this.renderer.setTimeOfDay(TIME_OF_DAY);
    const hit = this.player.target.hit;
    this.renderer.setBlockHighlight(hit ? hit.block : null);

    if (this.entities && this.entityRenderer) {
      this.entityRenderer.sync(this.entities.all);
      this.entityRenderer.update(this.entities.all);
    }

    this.renderer.render(alpha);

    this.hudTimer += this.renderer.stats.frameMs / 1000;
    if (this.hudTimer >= HUD_INTERVAL) {
      this.hudTimer = 0;
      this.pushHud(false);
      this.pushDebug();
    }
  }

  // --- helpers -----------------------------------------------------------

  private handleGlobalKeys(): void {
    if (this.input.consumePressed('pause')) {
      if (this.bridge.getSnapshot().inventoryOpen) this.toggleInventory();
      else if (this.paused) this.resume();
      else this.pause();
    }
    if (this.input.consumePressed('toggle_debug')) this.toggleDebug();
    if (this.input.consumePressed('debug_spawn')) this.spawnTestCreature();
    if (this.input.consumePressed('open_inventory') && !this.paused) this.toggleInventory();
  }

  /** Remesh up to `budget` dirty chunks, nearest to `focus` (defaults to the player) first. */
  private processRemesh(budget: number, focus?: { x: number; y: number; z: number }): void {
    if (!this.world || !this.renderer || !this.content) return;
    const at = focus ?? this.player?.state.position ?? { x: 0, y: 0, z: 0 };
    const fcx = worldToChunk(at.x);
    const fcz = worldToChunk(at.z);

    const dirty: IChunk[] = [];
    for (const chunk of this.world.chunks.loaded) {
      if (chunk.meshDirty) dirty.push(chunk);
    }
    if (dirty.length === 0) return;
    dirty.sort(
      (a, b) =>
        (a.pos.cx - fcx) ** 2 + (a.pos.cz - fcz) ** 2 - ((b.pos.cx - fcx) ** 2 + (b.pos.cz - fcz) ** 2),
    );
    for (let i = 0; i < Math.min(budget, dirty.length); i++) this.remeshChunk(dirty[i]);
  }

  private flushRemesh(max: number, focus: { x: number; y: number; z: number }): void {
    this.processRemesh(max, focus);
  }

  private remeshChunk(chunk: IChunk): void {
    if (!this.world || !this.renderer || !this.content || !this.atlas) return;
    const { cx, cy, cz } = chunk.pos;
    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const world = this.world;
    const view: ChunkMeshView = {
      cx,
      cy,
      cz,
      revision: chunk.revision,
      get: (lx, ly, lz) => world.getBlock(ox + lx, oy + ly, oz + lz),
    };
    const result = this.mesher.build(view, this.content.blocks, this.atlas);
    this.renderer.setChunkMesh(result);
    chunk.meshDirty = false;
  }

  private markAround(x: number, y: number, z: number): void {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const c = this.world?.chunks.get(worldToChunk(x + dx), worldToChunk(y + dy), worldToChunk(z + dz));
          if (c) c.meshDirty = true;
        }
      }
    }
  }

  private heldPlaceableBlock(): number | null {
    if (!this.inventory || !this.content) return null;
    const stack = this.inventory.selectedStack();
    if (!stack) return null;
    return this.content.items.get(stack.item).placesBlock;
  }

  private onBlockBroken(x: number, y: number, z: number, id: number, mode: GameMode): void {
    if (mode === GameMode.Creative || !this.inventory || !this.content) return;
    const def = this.content.blocks.get(id);
    for (const drop of def.drops) {
      if (Math.random() > drop.chance) continue;
      const count = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
      if (count <= 0) continue;
      const item = this.content.items.byName(drop.item);
      if (item) this.inventory.add({ item: item.numericId, count });
    }
    void x;
    void y;
    void z;
  }

  private grantStarterKit(mode: GameMode): void {
    if (!this.inventory || !this.content) return;
    const give = (name: string, count: number) => {
      const it = this.content!.items.byName(name);
      if (it) this.inventory!.add({ item: it.numericId, count });
    };
    if (mode === GameMode.Creative) {
      for (const name of ['voxelia:stone', 'voxelia:amberwood_planks', 'voxelia:glass', 'voxelia:amberwood_log', 'voxelia:sand', 'voxelia:torch']) {
        give(name, 64);
      }
    } else {
      give('voxelia:wood_pickaxe', 1);
      give('voxelia:wood_axe', 1);
      give('voxelia:bread', 3);
    }
    this.inventory.selectedSlot = 0;
  }

  private pushHud(force: boolean): void {
    if (!this.player || !this.inventory || !this.content) return;
    const s = this.player.state;
    const hotbar: HudSnapshot['hotbar'] = [];
    for (let i = 0; i < 9; i++) {
      const stack = this.inventory.get(i);
      if (!stack) {
        hotbar.push(null);
        continue;
      }
      const def = this.content.items.get(stack.item);
      hotbar.push({
        itemName: def.name,
        displayName: def.displayName,
        count: stack.count,
        texture: def.texture,
        durability: def.durability > 0 ? 1 - (stack.damage ?? 0) / def.durability : null,
      });
    }
    const hud: HudSnapshot = {
      health: s.stats.health,
      maxHealth: s.stats.maxHealth,
      hunger: s.stats.hunger,
      maxHunger: 20,
      xpLevel: s.stats.xpLevel,
      xpProgress: s.stats.xpProgress,
      gameMode: s.gameMode,
      hotbar,
      selectedSlot: this.inventory.selectedSlot,
      toast: null,
    };
    this.bridge.setSnapshot({ hud });
    void force;
  }

  private pushDebug(): void {
    if (!this.player || !this.world || !this.renderer || !this.generator) return;
    const s = this.player.state;
    const biome = this.generator.biomeAt(Math.floor(s.position.x), Math.floor(s.position.z));
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const debug: DebugSnapshot = {
      fps: Math.round(this.loop?.fps ?? 0),
      frameMs: +this.renderer.stats.frameMs.toFixed(1),
      updateMs: 0,
      renderMs: 0,
      x: +s.position.x.toFixed(2),
      y: +s.position.y.toFixed(2),
      z: +s.position.z.toFixed(2),
      yaw: +s.yaw.toFixed(2),
      pitch: +s.pitch.toFixed(2),
      biome: biome.displayName,
      facing: facingLabel(s.yaw),
      chunksLoaded: this.world.chunks.count,
      chunksRendered: this.renderer.stats.chunkMeshes,
      triangles: this.renderer.stats.triangles,
      drawCalls: this.renderer.stats.drawCalls,
      entities: this.entities?.all.length ?? 0,
      seed: this.world.seed,
      worldTime: this.worldTimeTicks,
      memoryMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null,
      targetBlock: this.player.target.hit ? this.content!.blocks.get(this.player.target.hit.blockId).displayName : null,
    };
    this.bridge.setSnapshot({ debug });
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.bridge.setSnapshot({ phase: 'paused' });
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.input.setEnabled(true);
    this.bridge.setSnapshot({ phase: 'playing', inventoryOpen: false });
  }

  private toggleDebug(): void {
    this.bridge.setSnapshot({ showDebug: !this.bridge.getSnapshot().showDebug });
  }

  private toggleInventory(): void {
    const open = !this.bridge.getSnapshot().inventoryOpen;
    this.paused = open;
    this.input.setEnabled(!open);
    if (open) this.input.exitPointerLock();
    this.bridge.setSnapshot({ inventoryOpen: open, phase: open ? 'paused' : 'playing' });
  }

  private async exitToMenu(): Promise<void> {
    await this.save();
    this.loop?.stop();
    this.loop = null;
    this.input.detach();
    this.entityRenderer?.dispose();
    this.entityRenderer = null;
    this.entities?.clear();
    this.entities = null;
    this.voxels = null;
    this.canSee = null;
    this.elapsed = 0;
    this.renderer?.dispose();
    this.renderer = null;
    this.world?.dispose();
    this.world = null;
    this.player = null;
    this.dirtyChunks.clear();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.bridge.setSnapshot({ phase: 'menu', hud: null, debug: null, worldName: null, inventoryOpen: false });
  }

  /**
   * Sky light at a block, 0..15.
   *
   * There is no voxel light propagation yet, so this answers the only question
   * spawning and horror brains actually ask: is this spot open to the sky?
   * Anything with solid blocks overhead reads as dark. Replace this when the
   * real light engine lands; nothing else needs to change.
   */
  private skyLightAt(x: number, y: number, z: number): number {
    if (!this.world || !this.content) return 15;
    const blocks = this.content.blocks;
    for (let probe = y + 1; probe < WORLD_MAX_Y; probe++) {
      if (blocks.isSolid(this.world.getBlock(x, probe, z))) return 0;
    }
    // Open to the sky: bright by day, dark at night.
    const day = Math.sin(TIME_OF_DAY * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    return Math.round(day * 15);
  }

  /**
   * Drop the reference creature a few blocks ahead of the player. Bound to F6
   * so creature work can be eyeballed without waiting for natural spawning.
   */
  private spawnTestCreature(): void {
    if (!this.entities || !this.player || !this.world || !this.content) return;
    const s = this.player.state;
    // Cycle through the roster, so F6 reaches every creature while iterating.
    const roster = this.content.creatures.all;
    if (roster.length === 0) return;
    const def = roster[this.spawnCursor++ % roster.length];
    const dist = 6 + def.width * 2;
    const x = s.position.x - Math.sin(s.yaw) * dist;
    const z = s.position.z - Math.cos(s.yaw) * dist;
    const ground = this.world.getSurfaceY(Math.floor(x), Math.floor(z));
    const y = ground >= 0 ? ground + 1 : s.position.y;
    this.entities.spawn(def.name, { x, y, z });
  }

  /** Roll a dead creature's drops into the player's inventory. */
  private onEntityDeath(entity: IEntity): void {
    if (!this.inventory || !this.content) return;
    for (const drop of entity.definition.drops ?? []) {
      if (Math.random() > drop.chance) continue;
      const count = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
      if (count <= 0) continue;
      const item = this.content.items.byName(drop.item);
      if (item) this.inventory.add({ item: item.numericId, count });
    }
  }

  private async save(): Promise<void> {
    if (!this.storage || !this.player) return;
    await this.storage.savePlayer(this.player.serialize());
    await this.storage.saveWorldState({
      time: this.worldTimeTicks,
      weather: 0,
      spawn: { x: 0, y: SEA_LEVEL, z: 0 },
    });
  }

  private installResizeObserver(): void {
    if (!this.canvas || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
    this.resizeObserver.observe(this.canvas);
  }

  private syncCanvasSize(): void {
    if (!this.canvas || !this.renderer) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.resize(w, h);
  }
}

function facingLabel(yaw: number): string {
  const deg = ((yaw * 180) / Math.PI) % 360;
  const n = ((deg % 360) + 360) % 360;
  if (n < 45 || n >= 315) return 'North (-Z)';
  if (n < 135) return 'East (+X)';
  if (n < 225) return 'South (+Z)';
  return 'West (-X)';
}

/** Default game options for quick-play. */
export const DEFAULT_NEW_WORLD: NewWorldOptions = {
  name: 'New World',
  seed: '',
  gameMode: GameMode.Survival,
  difficulty: Difficulty.Normal,
};
