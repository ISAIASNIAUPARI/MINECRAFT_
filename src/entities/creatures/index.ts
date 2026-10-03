import type { IEntityRegistry } from '../types';
import { HOLLOW } from './hollow';

export { HOLLOW } from './hollow';

/**
 * The core creature roster. Adding a creature is: write its definition file,
 * import it here, add it to the array. Nothing else in the engine changes.
 */
export const CORE_CREATURES = [HOLLOW];

export function registerCoreCreatures(entities: IEntityRegistry): void {
  for (const creature of CORE_CREATURES) entities.register(creature);
}
