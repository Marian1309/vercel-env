export const TARGET_ENVS = ["development", "production"] as const;

export const ENV_CONFIG = {
  development: {
    localFile: ".env.local",
    vercelEnv: "development"
  },
  production: {
    localFile: ".env.prod",
    vercelEnv: "production"
  }
} as const;

// Variables that should not be pulled from Vercel to local
// These are typically system-generated or environment-specific tokens
export const EXCLUDED_FROM_PULL = {
  // Variables excluded from all environments
  all: [
    "VERCEL_OIDC_TOKEN", // System-generated OIDC token
    "VERCEL_URL", // Vercel system variable
    "VERCEL_ENV", // Vercel system variable
    "VERCEL_REGION" // Vercel system variable
  ],
  // Variables excluded only from development
  development: [
    // Add development-specific exclusions here if needed
  ],
  // Variables excluded only from production
  production: [
    "NX_DAEMON", // NX build system variable
    "TURBO_CACHE", // Turborepo cache variable
    "TURBO_DOWNLOAD_LOCAL_ENABLED", // Turborepo download setting
    "TURBO_REMOTE_ONLY", // Turborepo remote-only setting
    "TURBO_RUN_SUMMARY", // Turborepo run summary setting
    "VERCEL", // Vercel system flag
    "VERCEL_TARGET_ENV" // Vercel target environment
  ]
};