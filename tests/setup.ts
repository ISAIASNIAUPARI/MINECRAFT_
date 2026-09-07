/**
 * Vitest global setup. Runs in the `node` environment by default; UI tests opt
 * into jsdom with a `// @vitest-environment jsdom` docblock.
 */
import { setLogLevel, LogLevel } from '../src/core/Logger';

setLogLevel(LogLevel.Silent);
