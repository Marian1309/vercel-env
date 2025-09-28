#!/usr/bin/env node

import { deleteEnvs } from './delete-all.js';
import { syncEnvs } from './sync.js';
import type { Environment } from './types.js';

const showHelp = () => {
  console.log("🚀 Vercel Environment Sync CLI");
  console.log("===============================");
  console.log("");
  console.log("A comprehensive tool for syncing environment variables between local files and Vercel.");
  console.log("");
  console.log("Usage:");
  console.log("  npx @pidchashyi/vercel-env --sync     # Sync environments (interactive)");
  console.log("  npx @pidchashyi/vercel-env --delete   # Delete environment variables (interactive)");
  console.log("");
  console.log("Sync Options:");
  console.log("  --sync                 Start environment sync");
  console.log("  --dev, --development   Sync development environment only");
  console.log("  --prod, --production   Sync production environment only");
  console.log("  --auto, -a             Auto mode (apply all changes with confirmation)");
  console.log("  --interactive, -i      Interactive mode (default - review each change)");
  console.log("");
  console.log("Delete Options:");
  console.log("  --delete               Start environment variable deletion");
  console.log("  --force, -f            Force deletion without confirmation (not recommended)");
  console.log("");
  console.log("Examples:");
  console.log("  npx @pidchashyi/vercel-env --sync");
  console.log("  npx @pidchashyi/vercel-env --sync --dev --auto");
  console.log("  npx @pidchashyi/vercel-env --sync --prod --interactive");
  console.log("  npx @pidchashyi/vercel-env --delete");
  console.log("");
  console.log("Library Usage:");
  console.log("  import { syncEnvs, deleteEnvs } from '@pidchashyi/vercel-env';");
  console.log("  await syncEnvs({ environments: ['development'], mode: 'auto' });");
  console.log("  await deleteEnvs({ environments: ['production'] });");
};

const main = async () => {
  const args = process.argv.slice(2);

  // Show help if no arguments or help flag
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  const hasSync = args.includes("--sync");
  const hasDelete = args.includes("--delete");

  // Validate that only one main action is specified
  if (hasSync && hasDelete) {
    console.error("❌ Error: Cannot use both --sync and --delete flags together");
    console.log("Use --help for usage information");
    process.exit(1);
  }

  if (!hasSync && !hasDelete) {
    console.error("❌ Error: Must specify either --sync or --delete flag");
    console.log("Use --help for usage information");
    process.exit(1);
  }

  try {
    if (hasSync) {
      // Parse sync-specific arguments
      const hasDevArg = args.includes("--dev") || args.includes("--development");
      const hasProdArg = args.includes("--prod") || args.includes("--production");
      const hasAutoArg = args.includes("--auto") || args.includes("-a");
      const hasInteractiveArg = args.includes("--interactive") || args.includes("-i");

      let environments: Environment[] = [];
      let mode: "interactive" | "auto" = "interactive";

      // Set mode
      if (hasAutoArg) {
        mode = "auto";
      } else if (hasInteractiveArg) {
        mode = "interactive";
      }

      // Set environments
      if (hasDevArg && !hasProdArg) {
        environments = ["development"];
      } else if (hasProdArg && !hasDevArg) {
        environments = ["production"];
      } else if (hasDevArg && hasProdArg) {
        environments = ["development", "production"];
      }

      await syncEnvs({
        environments: environments.length > 0 ? environments : undefined,
        mode,
        dev: hasDevArg,
        prod: hasProdArg
      });

    } else if (hasDelete) {
      // Parse delete-specific arguments
      const hasForceArg = args.includes("--force") || args.includes("-f");
      const hasDevArg = args.includes("--dev") || args.includes("--development");
      const hasProdArg = args.includes("--prod") || args.includes("--production");

      let environments: Environment[] = [];

      // Set environments
      if (hasDevArg && !hasProdArg) {
        environments = ["development"];
      } else if (hasProdArg && !hasDevArg) {
        environments = ["production"];
      } else if (hasDevArg && hasProdArg) {
        environments = ["development", "production"];
      }

      await deleteEnvs({
        environments: environments.length > 0 ? environments : undefined,
        force: hasForceArg
      });
    }

  } catch (error) {
    console.error("💥 Unexpected error:", error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
};

// Handle process termination gracefully
process.on("SIGINT", () => {
  console.log("\n👋 Operation cancelled by user");
  process.exit(0);
});

// Run the CLI
main().catch((error) => {
  console.error("💥 CLI Error:", error instanceof Error ? error.message : "Unknown error");
  process.exit(1);
});
