// Export named modules for library usage
export { deleteEnvs } from './delete-all';
export { syncEnvs } from './sync';

// Export types for TypeScript users
export type {
  Environment,
  EnvVariable,
  DeleteChoice,
  EnvVars,
  SyncAction,
  EnvDiff,
  SyncChoice,
  DeleteEnvsOptions,
  SyncEnvsOptions
} from './types';