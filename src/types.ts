// Shared types for the library
export const TARGET_ENVS = ["development", "production"] as const;
export type Environment = (typeof TARGET_ENVS)[number];

export interface EnvVariable {
  name: string;
  environments: Environment[];
  value?: string;
}

export interface DeleteChoice {
  name: string;
  value: EnvVariable;
  checked: boolean;
}

export type EnvVars = Record<string, string>;
export type SyncAction = "add" | "update" | "delete" | "pull" | "remove_from_vercel";

export interface EnvDiff {
  action: SyncAction;
  key: string;
  localValue?: string;
  vercelValue?: string;
  environment: Environment;
  selected?: boolean;
}

export interface SyncChoice {
  name: string;
  value: EnvDiff;
  checked: boolean;
}

// Configuration types
export interface DeleteEnvsOptions {
  environments?: Environment[];
  interactive?: boolean;
  force?: boolean;
}

export interface SyncEnvsOptions {
  environments?: Environment[];
  mode?: "interactive" | "auto";
  dev?: boolean;
  prod?: boolean;
}
