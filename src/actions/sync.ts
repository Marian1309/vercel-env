import { execSync } from "child_process";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import inquirer from "inquirer";
import type { Environment, EnvVars, SyncAction, EnvDiff, SyncChoice, SyncEnvsOptions } from '../types';
import { ENV_CONFIG, EXCLUDED_FROM_PULL } from '../constants';

// Helper function to check if a variable should be excluded from pull
const isExcludedFromPull = (key: string, environment: Environment): boolean => {
  return EXCLUDED_FROM_PULL.all.includes(key) || EXCLUDED_FROM_PULL[environment].includes(key as never);
};


// Utility functions
const run = (command: string, input?: string, suppressError = false): string | null => {
  try {
    const result = execSync(command, {
      stdio: input ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
      input: input || undefined,
      encoding: "utf-8"
    });
    return result.toString().trim();
  } catch (err: any) {
    if (!suppressError) {
      console.error(`❌ Command failed: ${command}`);
      console.error(err.message);
    }
    return null;
  }
};

const parseEnvFile = (content: string): EnvVars => {
  const envVars: EnvVars = {};

  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim().replace(/^"|"$/g, ""); // remove quotes
    if (key && value !== undefined) {
      envVars[key] = value;
    }
  });

  return envVars;
};

const writeEnvFile = (filePath: string, envVars: EnvVars): void => {
  const content = Object.entries(envVars)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");

  fs.writeFileSync(filePath, content + "\n", "utf-8");
};

const getLocalEnvVars = (environment: Environment): EnvVars => {
  const filePath = ENV_CONFIG[environment].localFile;

  if (!fs.existsSync(filePath)) {
    console.log(`📝 ${filePath} doesn't exist, creating empty file...`);
    fs.writeFileSync(filePath, "", "utf-8");
    return {};
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return parseEnvFile(content);
};

const getVercelEnvVars = (environment: Environment): EnvVars => {
  const vercelEnv = ENV_CONFIG[environment].vercelEnv;

  // Directly pull the actual values to a temporary file (this is more reliable)
  const tempFile = `.temp_${environment}_${Date.now()}.env`;
  const pullResult = run(
    `bun vercel env pull ${tempFile} --environment ${vercelEnv}`,
    undefined,
    true
  );

  let envVars: EnvVars = {};

  if (pullResult !== null && fs.existsSync(tempFile)) {
    const tempContent = fs.readFileSync(tempFile, "utf-8");
    envVars = parseEnvFile(tempContent);

    // Clean up temp file
    fs.unlinkSync(tempFile);

    console.log(`   ✅ Successfully loaded ${Object.keys(envVars).length} variables from Vercel`);
  } else {
    // Fallback: try to get variable names from list command
    console.warn(`⚠️  Could not pull values from ${vercelEnv}, trying list command...`);

    const listResult = run(`bun vercel env ls ${vercelEnv}`, undefined, true);
    if (listResult) {
      const varNames: string[] = [];
      const lines = listResult.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines, headers, and command output lines
        if (
          trimmed &&
          !trimmed.startsWith("Vercel CLI") &&
          !trimmed.startsWith(">") &&
          !trimmed.startsWith("name") &&
          !trimmed.startsWith("Common next commands") &&
          !trimmed.startsWith("-") &&
          !trimmed.includes("Environment Variables found") &&
          !trimmed.includes("Retrieving project") &&
          !trimmed.includes("Saving")
        ) {
          const parts = trimmed.split(/\s+/);
          const varName = parts[0];

          // Ensure it's a valid environment variable name
          if (
            varName &&
            varName !== "name" &&
            !varName.startsWith("`") &&
            !varName.startsWith("vercel") &&
            varName.match(/^[A-Z_][A-Z0-9_]*$/i)
          ) {
            varNames.push(varName);
          }
        }
      }

      console.warn(
        `   Found ${varNames.length} variable names, marking as encrypted for comparison`
      );
      for (const varName of varNames) {
        envVars[varName] = "[ENCRYPTED]";
      }
    } else {
      console.error(`❌ Could not fetch any information from Vercel ${vercelEnv}`);
    }
  }

  return envVars;
};

const calculateDiffs = (
  localVars: EnvVars,
  vercelVars: EnvVars,
  environment: Environment
): EnvDiff[] => {
  const diffs: EnvDiff[] = [];
  const allKeys = new Set([...Object.keys(localVars), ...Object.keys(vercelVars)]);

  for (const key of allKeys) {
    const localValue = localVars[key];
    const vercelValue = vercelVars[key];
    const hasLocal = localValue !== undefined && localValue !== "";
    const hasVercel = vercelValue !== undefined && vercelValue !== "";

    if (hasLocal && !hasVercel) {
      // Local has it, Vercel doesn't - provide multiple options
      
      // Option 1: Add to Vercel
      diffs.push({
        action: "add",
        key,
        localValue,
        environment
      });

      // Option 2: Remove from local
      diffs.push({
        action: "remove_from_local",
        key,
        localValue,
        environment
      });
    } else if (!hasLocal && hasVercel) {
      // Vercel has it, local doesn't - provide both options unless excluded
      if (!isExcludedFromPull(key, environment)) {
        // Option 1: Pull from Vercel to local
        diffs.push({
          action: "pull",
          key,
          vercelValue,
          environment
        });

        // Option 2: Remove from Vercel
        diffs.push({
          action: "remove_from_vercel",
          key,
          vercelValue,
          environment
        });
      }
    } else if (hasLocal && hasVercel) {
      // Both have the variable - compare values
      if (vercelValue === "[ENCRYPTED]") {
        // Can't compare encrypted values, assume they might be different
        // This is a fallback case when we couldn't pull actual values
        diffs.push({
          action: "update",
          key,
          localValue,
          vercelValue,
          environment
        });
      } else if (localValue !== vercelValue) {
        // Values are different - UPDATE Vercel with local value
        diffs.push({
          action: "update",
          key,
          localValue,
          vercelValue,
          environment
        });
      }
      // If localValue === vercelValue, no diff needed - they're in sync
    }
  }
  return diffs;
};

const formatDiffDescription = (diff: EnvDiff): string => {
  const { action, key, localValue, vercelValue, environment } = diff;
  const envIcon = environment === "development" ? "🔧" : "🚀";

  const getActionIcon = (action: SyncAction) => {
    switch (action) {
      case "add":
        return "➕ ";
      case "update":
        return "🔄 ";
      case "pull":
        return "⬇️ ";
      case "remove_from_vercel":
        return "🗑️ ";
      case "remove_from_local":
        return "🗑️ ";
      case "delete":
        return "❌ ";
      default:
        return "❓ ";
    }
  };

  const actionIcon = getActionIcon(action);
  let description = `${envIcon} ${actionIcon} ${action.toUpperCase().replace("_", " ")} ${key}`;

  const truncateValue = (value: string, maxLength = 500) => {
    return value.length > maxLength ? value.substring(0, maxLength - 3) + "..." : value;
  };

  if (action === "add" && localValue && !vercelValue) {
    // Adding new variable to Vercel
    description += ` → Vercel (${environment})`;
    description += `\n     Value: "${truncateValue(localValue)}"`;
  } else if (action === "pull") {
    // Pulling variable from Vercel to local
    description += ` ← Vercel (${environment})`;
    if (vercelValue === "[ENCRYPTED]") {
      description += `\n     Will pull encrypted value from Vercel to ${ENV_CONFIG[environment].localFile}`;
    } else {
      description += `\n     Value: "${truncateValue(vercelValue || "")}"`;
    }
  } else if (action === "remove_from_vercel") {
    // Removing variable from Vercel
    description += ` 🗑️ Vercel (${environment})`;
    description += `\n     Will DELETE this variable from Vercel`;
    if (vercelValue && vercelValue !== "[ENCRYPTED]") {
      description += `\n     Current Value: "${truncateValue(vercelValue)}"`;
    }
  } else if (action === "remove_from_local") {
    // Removing variable from local file
    description += ` 🗑️ Local (${ENV_CONFIG[environment].localFile})`;
    description += `\n     Will DELETE this variable from local file`;
    if (localValue) {
      description += `\n     Current Value: "${truncateValue(localValue)}"`;
    }
  } else if (action === "update" && localValue && vercelValue) {
    // Updating existing variable
    description += ` → Vercel (${environment}) [UPDATE]`;
    if (vercelValue === "[ENCRYPTED]") {
      description += `\n     Local: "${truncateValue(localValue)}"`;
      description += `\n     Vercel: [ENCRYPTED - will be updated]`;
    } else {
      description += `\n     Local:  "${truncateValue(localValue)}"`;
      description += `\n     Vercel: "${truncateValue(vercelValue)}"`;
    }
  }

  return description;
};

const selectDiffsToApply = async (diffs: EnvDiff[]): Promise<EnvDiff[] | null> => {
  if (diffs.length === 0) return [];

  const choices: SyncChoice[] = diffs.map((diff) => ({
    name: formatDiffDescription(diff),
    value: diff,
    checked: true // Default to all selected
  }));

  // Add separator and "Do Nothing" option
  choices.push(
    { name: "────────────────────────────────────────", value: null as any, checked: false },
    { 
      name: "❌ Do Nothing - Exit without making any changes", 
      value: { action: "exit" } as any, 
      checked: false 
    }
  );

  const answers = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedDiffs",
      message:
        "🔄 Select environment variables to sync (use ↑↓ arrows, space to select/deselect, enter to confirm):",
      choices: choices,
      pageSize: 15,
      loop: false,
      validate: (input) => {
        // Allow empty selection or exit option
        return true;
      }
    }
  ]);

  const selectedDiffs = answers.selectedDiffs as EnvDiff[];
  
  // Check if user selected "Do Nothing" option
  const exitSelected = selectedDiffs.some((diff: any) => diff?.action === "exit");
  if (exitSelected) {
    console.log("👋 Exiting without making any changes...");
    return null; // Return null to indicate exit
  }

  // Filter out separator and exit options, keep only real diffs
  const realDiffs = selectedDiffs.filter((diff: any) => 
    diff && diff.action !== "exit" && typeof diff.action === "string" && diff.key
  );

  if (realDiffs.length === 0) {
    console.log("ℹ️  No variables selected for sync.");
    return [];
  }

  return realDiffs;
};

const confirmEnvironmentSync = async (
  environment: Environment,
  diffsCount: number
): Promise<boolean> => {
  const envIcon = environment === "development" ? "🔧" : "🚀";
  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: `${envIcon} Proceed with syncing ${diffsCount} variables in ${environment} environment?`,
      default: true
    }
  ]);

  return answer.proceed;
};

const selectSyncMode = async (): Promise<"interactive" | "auto"> => {
  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "🎯 Select sync mode:",
      choices: [
        {
          name: "🎮 Interactive Mode - Review and select each change individually",
          value: "interactive"
        },
        {
          name: "⚡ Auto Mode - Apply all changes automatically (with confirmation)",
          value: "auto"
        }
      ],
      default: "interactive"
    }
  ]);

  return answer.mode;
};

const selectEnvironments = async (): Promise<Environment[]> => {
  const answer = await inquirer.prompt([
    {
      type: "checkbox",
      name: "environments",
      message: "🌍 Select environments to sync:",
      choices: [
        {
          name: "🔧 Development (.env.local ↔ Vercel development)",
          value: "development" as Environment,
          checked: true
        },
        {
          name: "🚀 Production (.env.prod ↔ Vercel production)",
          value: "production" as Environment,
          checked: true
        }
      ],
      validate: (input) => {
        if (input.length === 0) {
          return "Please select at least one environment to sync.";
        }
        return true;
      }
    }
  ]);

  return answer.environments;
};

const confirmIndividualChange = async (diff: EnvDiff): Promise<boolean> => {
  const { action, key, environment } = diff;
  const envIcon = environment === "development" ? "🔧" : "🚀";

  const getActionIcon = (action: SyncAction) => {
    switch (action) {
      case "add":
        return "➕";
      case "update":
        return "🔄";
      case "pull":
        return "⬇️";
      case "remove_from_vercel":
        return "🗑️";
      case "remove_from_local":
        return "🗑️";
      case "delete":
        return "❌";
      default:
        return "❓";
    }
  };

  const actionIcon = getActionIcon(action);
  const actionText = action.replace("_", " ");

  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: `${envIcon} ${actionIcon} Apply ${actionText} for ${key} in ${environment}?`,
      default: action !== "remove_from_vercel" && action !== "remove_from_local" // Default to false for destructive actions
    }
  ]);

  return answer.proceed;
};

const applyDiff = async (
  diff: EnvDiff,
  mode: "interactive" | "auto" = "interactive"
): Promise<boolean> => {
  const { action, key, localValue, vercelValue, environment } = diff;
  const vercelEnv = ENV_CONFIG[environment].vercelEnv;
  const localFile = ENV_CONFIG[environment].localFile;

  // In interactive mode, ask for individual confirmation
  if (mode === "interactive") {
    const confirmed = await confirmIndividualChange(diff);
    if (!confirmed) {
      console.log(`⏭️  Skipped ${action} for ${key}`);
      return false;
    }
  }

  if (action === "add") {
    if (localValue) {
      // Add to Vercel
      console.log(`\n🔄 Adding ${key} to Vercel (${vercelEnv})...`);
      const result = run(`bun vercel env add ${key} ${vercelEnv}`, localValue);
      if (result !== null) {
        console.log(`✅ Added ${key} to Vercel ${vercelEnv}`);
        return true;
      } else {
        // Check if the error is because the variable already exists
        console.log(
          `⚠️  Variable ${key} might already exist in Vercel. Trying to update instead...`
        );

        // Try to remove and re-add (update)
        const removeResult = run(`bun vercel env rm ${key} ${vercelEnv} -y`, undefined, true);
        if (removeResult !== null) {
          const addResult = run(`bun vercel env add ${key} ${vercelEnv}`, localValue);
          if (addResult !== null) {
            console.log(`✅ Updated ${key} in Vercel ${vercelEnv} (was already existing)`);
            return true;
          }
        }

        console.error(`❌ Failed to add/update ${key} to Vercel ${vercelEnv}`);
        return false;
      }
    }
  } else if (action === "pull") {
    // Pull from Vercel to local
    if (vercelValue && vercelValue !== "[ENCRYPTED]") {
      // We already have the actual value
      console.log(`\n⬇️ Pulling ${key} from Vercel to ${localFile}...`);
      const localVars = getLocalEnvVars(environment);
      localVars[key] = vercelValue;
      writeEnvFile(localFile, localVars);
      console.log(`✅ Added ${key} to ${localFile}`);
      return true;
    } else if (vercelValue === "[ENCRYPTED]") {
      // Fallback: pull from Vercel if we only have encrypted placeholder
      console.log(`\n⬇️ Pulling ${key} from Vercel (${vercelEnv})...`);

      const tempFile = `.temp_${environment}_${Date.now()}.env`;
      const pullResult = run(
        `bun vercel env pull ${tempFile} --environment ${vercelEnv}`,
        undefined,
        true
      );

      if (pullResult !== null && fs.existsSync(tempFile)) {
        const tempContent = fs.readFileSync(tempFile, "utf-8");
        const tempVars = parseEnvFile(tempContent);

        if (tempVars[key]) {
          // Add to local file
          const localVars = getLocalEnvVars(environment);
          localVars[key] = tempVars[key];
          writeEnvFile(localFile, localVars);
          console.log(`✅ Added ${key} to ${localFile}`);

          // Clean up temp file
          fs.unlinkSync(tempFile);
          return true;
        }
      }

      // Clean up temp file if it exists
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }

      console.error(`❌ Failed to pull ${key} from Vercel ${vercelEnv}`);
      return false;
    }
  } else if (action === "remove_from_vercel") {
    // Remove variable from Vercel
    console.log(`\n🗑️  Removing ${key} from Vercel (${vercelEnv})...`);
    const result = run(`bun vercel env rm ${key} ${vercelEnv} -y`, undefined, false);
    if (result !== null) {
      console.log(`✅ Removed ${key} from Vercel ${vercelEnv}`);
      return true;
    } else {
      console.error(`❌ Failed to remove ${key} from Vercel ${vercelEnv}`);
      return false;
    }
  } else if (action === "remove_from_local") {
    // Remove variable from local file
    console.log(`\n🗑️  Removing ${key} from ${localFile}...`);
    try {
      const localVars = getLocalEnvVars(environment);
      delete localVars[key];
      writeEnvFile(localFile, localVars);
      console.log(`✅ Removed ${key} from ${localFile}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to remove ${key} from ${localFile}:`, error);
      return false;
    }
  } else if (action === "update" && localValue) {
    // Update Vercel with local value
    console.log(`\n🔄 Updating ${key} in Vercel (${vercelEnv})...`);

    // Remove old value first
    const removeResult = run(`bun vercel env rm ${key} ${vercelEnv} -y`, undefined, true);
    if (removeResult !== null) {
      // Add new value
      const addResult = run(`bun vercel env add ${key} ${vercelEnv}`, localValue);
      if (addResult !== null) {
        console.log(`✅ Updated ${key} in Vercel ${vercelEnv}`);
        return true;
      }
    }
    console.error(`❌ Failed to update ${key} in Vercel ${vercelEnv}`);
    return false;
  }

  console.log(`⏭️  Skipped ${action} for ${key}`);
  return false;
};

const syncEnvironment = async (
  environment: Environment,
  mode: "interactive" | "auto"
): Promise<void> => {
  const envIcon = environment === "development" ? "🔧" : "🚀";
  console.log(`\n${envIcon} Syncing ${environment} environment...`);
  console.log(`   Local file: ${ENV_CONFIG[environment].localFile}`);
  console.log(`   Vercel env: ${ENV_CONFIG[environment].vercelEnv}`);

  // Get current state
  console.log(`   🔄 Loading local variables...`);
  const localVars = getLocalEnvVars(environment);
  console.log(`   🔄 Loading Vercel variables...`);
  const vercelVars = getVercelEnvVars(environment);

  console.log(`   📊 Local variables: ${Object.keys(localVars).length}`);
  console.log(`   📊 Vercel variables: ${Object.keys(vercelVars).length}`);

  // Calculate differences
  const diffs = calculateDiffs(localVars, vercelVars, environment);

  if (diffs.length === 0) {
    console.log(`✅ ${environment} environment is already in sync!`);

    // Show which variables are in sync
    const syncedVars = Object.keys(localVars).filter(
      (key) =>
        vercelVars[key] && vercelVars[key] !== "[ENCRYPTED]" && localVars[key] === vercelVars[key]
    );
    const encryptedVars = Object.keys(vercelVars).filter(
      (key) => vercelVars[key] === "[ENCRYPTED]"
    );
    const excludedVars = Object.keys(vercelVars).filter(
      (key) => !localVars[key] && isExcludedFromPull(key, environment)
    );

    if (syncedVars.length > 0) {
      console.log(`   🔗 ${syncedVars.length} variables in sync: ${syncedVars.join(", ")}`);
    }
    if (encryptedVars.length > 0) {
      console.log(
        `   🔒 ${encryptedVars.length} encrypted variables (assumed in sync): ${encryptedVars.join(", ")}`
      );
    }
    if (excludedVars.length > 0) {
      console.log(`   🚫 ${excludedVars.length} excluded from pull: ${excludedVars.join(", ")}`);
    }
    return;
  }

  // Categorize differences
  const addToVercel = diffs.filter((d) => d.action === "add" && d.localValue);
  const pullFromVercel = diffs.filter((d) => d.action === "pull");
  const removeFromVercel = diffs.filter((d) => d.action === "remove_from_vercel");
  const updates = diffs.filter((d) => d.action === "update");

  // Group pull/remove options by variable name
  const variablesWithOptions = new Set([
    ...pullFromVercel.map((d) => d.key),
    ...removeFromVercel.map((d) => d.key)
  ]);

  // Also show excluded variables for context
  const excludedVars = Object.keys(vercelVars).filter(
    (key) => !localVars[key] && isExcludedFromPull(key, environment)
  );

  console.log(`\n📋 Found ${diffs.length} sync options in ${environment}:`);
  if (addToVercel.length > 0) {
    console.log(
      `   ➕ ${addToVercel.length} to add to Vercel: ${addToVercel.map((d) => d.key).join(", ")}`
    );
  }
  if (variablesWithOptions.size > 0) {
    console.log(
      `   ⚖️  ${variablesWithOptions.size} with options (pull ⬇️ or delete 🗑️): ${Array.from(variablesWithOptions).join(", ")}`
    );
  }
  if (updates.length > 0) {
    console.log(
      `   🔄 ${updates.length} to update in Vercel: ${updates.map((d) => d.key).join(", ")}`
    );
  }
  if (excludedVars.length > 0) {
    console.log(`   🚫 ${excludedVars.length} excluded from pull: ${excludedVars.join(", ")}`);
  }

  let selectedDiffs: EnvDiff[] = [];

  if (mode === "interactive") {
    // Let user select which diffs to apply
    const result = await selectDiffsToApply(diffs);
    
    // Check if user chose to exit
    if (result === null) {
      console.log(`👋 Exited ${environment} sync without making changes`);
      return;
    }
    
    selectedDiffs = result;
  } else {
    // Auto mode - confirm all changes
    const proceedAll = await confirmEnvironmentSync(environment, diffs.length);
    if (!proceedAll) {
      console.log(`⏭️  Skipped ${environment} sync`);
      return;
    }
    selectedDiffs = diffs;
  }

  if (selectedDiffs.length === 0) {
    console.log(`⏭️  No changes selected for ${environment}`);
    return;
  }

  console.log(`\n🚀 Applying ${selectedDiffs.length} changes to ${environment}...\n`);

  // Apply each selected diff
  let successCount = 0;
  for (const diff of selectedDiffs) {
    const success = await applyDiff(diff, mode);
    if (success) successCount++;
  }

  console.log(
    `\n📊 ${environment} sync completed: ${successCount}/${selectedDiffs.length} changes applied`
  );
};

/**
 * Sync environment variables between local files and Vercel
 * @param options - Configuration options for sync
 */
export const syncEnvs = async (options: SyncEnvsOptions = {}): Promise<void> => {
  console.log("🚀 Starting comprehensive environment sync...\n");

  // Check if Vercel CLI is available
  const vercelCheck = run("bun vercel --version", undefined, true);
  if (!vercelCheck) {
    console.error("❌ Vercel CLI not found. Please install it first:");
    console.error("   npm i -g vercel");
    process.exit(1);
  }

  console.log(`✅ Vercel CLI detected: ${vercelCheck.split("\n")[0]}\n`);

  // Determine mode and environments from options
  let environments: Environment[] = [];
  let mode: "interactive" | "auto" = options.mode || "interactive";

  // Set environments from options
  if (options.environments) {
    environments = options.environments;
  } else if (options.dev && !options.prod) {
    environments = ["development"];
  } else if (options.prod && !options.dev) {
    environments = ["production"];
  } else if (options.dev && options.prod) {
    environments = ["development", "production"];
  }

  // If no environments specified, use interactive selection
  if (environments.length === 0) {
    if (mode === "interactive") {
      mode = await selectSyncMode();
      environments = await selectEnvironments();
    } else {
      // Default to both environments in auto mode
      environments = ["development", "production"];
    }
  }

  console.log(`\n🎯 Mode: ${mode === "interactive" ? "🎮 Interactive" : "⚡ Auto"}`);
  console.log(
    `🌍 Environments: ${environments.map((env) => (env === "development" ? "🔧 Development" : "🚀 Production")).join(", ")}\n`
  );

  // Sync each environment
  for (const env of environments) {
    try {
      await syncEnvironment(env, mode);
    } catch (error) {
      console.error(
        `💥 Error syncing ${env}:`,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  console.log("\n🎉 Environment sync completed!");
};

// CLI wrapper for backwards compatibility
const main = async () => {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let environments: Environment[] = [];
  let mode: "interactive" | "auto" = "interactive";

  // Check for command line arguments
  const hasDevArg = args.includes("--dev") || args.includes("--development");
  const hasProdArg = args.includes("--prod") || args.includes("--production");
  const hasAutoArg = args.includes("--auto") || args.includes("-a");
  const hasInteractiveArg = args.includes("--interactive") || args.includes("-i");

  // Set mode from command line
  if (hasAutoArg) {
    mode = "auto";
  } else if (hasInteractiveArg) {
    mode = "interactive";
  }

  // Set environments from command line
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

  console.log("\n📖 Usage examples:");
  console.log("  npx @pidchashyi/vercel-env --sync                    # Interactive mode - choose everything");
  console.log("  npx @pidchashyi/vercel-env --sync --dev              # Sync development only (interactive)");
  console.log("  npx @pidchashyi/vercel-env --sync --prod             # Sync production only (interactive)");
  console.log("  npx @pidchashyi/vercel-env --sync --dev --auto       # Auto sync development");
  console.log("  npx @pidchashyi/vercel-env --sync --prod --auto      # Auto sync production");
  console.log("  npx @pidchashyi/vercel-env --sync --auto             # Auto sync both environments");
};

// Handle process termination gracefully
process.on("SIGINT", () => {
  console.log("\n👋 Sync cancelled by user");
  process.exit(0);
});

// Only run main if this file is executed directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error("💥 Unexpected error:", error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  });
}
