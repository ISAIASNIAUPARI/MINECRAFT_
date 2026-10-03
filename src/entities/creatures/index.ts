import type { IEntityRegistry } from '../types';
import { HOLLOW } from './hollow';
import { ABYSSAL_WORM } from './abyssalWorm';
import { DEVOURER } from './devourer';
import { LURKER } from './lurker';
import { STAGWRAITH } from './stagwraith';

export { HOLLOW } from './hollow';
export { ABYSSAL_WORM } from './abyssalWorm';
export { DEVOURER } from './devourer';
export { LURKER } from './lurker';
export { STAGWRAITH } from './stagwraith';

/**
 * The core creature roster. Adding a creature is: write its definition file,
 * import it here, add it to the array. Nothing else in the engine changes.
 */
export const CORE_CREATURES = [HOLLOW, STAGWRAITH, LURKER, DEVOURER, ABYSSAL_WORM];

export function registerCoreCreatures(entities: IEntityRegistry): void {
  for (const creature of CORE_CREATURES) entities.register(creature);
}
