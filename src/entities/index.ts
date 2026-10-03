export * from './types';
export { Entity } from './Entity';
export { EntityRegistry } from './EntityRegistry';
export { EntityManager, type EntityManagerOptions } from './EntityManager';
export { EntityRenderer } from './EntityRenderer';
export {
  createStalkerBrain,
  DEFAULT_STALKER,
  distance3,
  distanceXZ,
  hasLineOfSight,
  idleIntent,
  shouldHopObstacle,
  steerAway,
  steerTowards,
  type StalkerConfig,
} from './ai';
export { CORE_CREATURES, registerCoreCreatures, HOLLOW } from './creatures';
