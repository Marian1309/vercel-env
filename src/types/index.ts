import { TARGET_ENVS } from '../constants';

export type Environment = (typeof TARGET_ENVS)[number];

export type EnvVariable = {
  name: string;
  environments: Environment[];
  value?: string;
}


export type EnvVars = Record<string, string>;
export type SyncAction = "add" | "update" | "delete" | "pull" | "remove_from_vercel" | "remove_from_local";

export type EnvDiff = {
  action: SyncAction;
  key: string;
  localValue?: string;
  vercelValue?: string;
  environment: Environment;
  selected?: boolean;
}

export type SyncChoice = {
  label: string;
  value: EnvDiff;
  hint?: string;
}

export type DeleteEnvsOptions = {
  environments?: Environment[];
  interactive?: boolean;
  force?: boolean;
}

export type SyncEnvsOptions = {
  environments?: Environment[];
  mode?: "interactive" | "auto";
  dev?: boolean;
  prod?: boolean;
}
