import { execSync } from "child_process";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as p from '@clack/prompts';
import { isCancel, cancel } from '@clack/prompts';
import type { Environment, EnvVariable, DeleteEnvsOptions } from '../types';
import { EXCLUDED_FROM_PULL } from '../constants';

// Helper function to check if a variable should be excluded from deletion
const isSystemVariable = (key: string, environment: Environment): boolean => {
  return EXCLUDED_FROM_PULL.all.includes(key) || EXCLUDED_FROM_PULL[environment].includes(key as never);
};

const run = (command: string, suppressError = false): string | null => {
  try {
    const result = execSync(command, {
      stdio: ["pipe", "pipe", "pipe"],
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

const getVercelEnvVars = async (selectedEnvironments: Environment[]): Promise<EnvVariable[]> => {
  console.log("🔍 Fetching environment variables from Vercel...");
  const envVarsMap: Record<string, EnvVariable> = {};

  for (const env of selectedEnvironments) {
    const envIcon = env === "development" ? "🔧" : "🚀";
    console.log(`  ${envIcon} Checking ${env} environment...`);

    // Try to pull actual values first
    const tempFile = `.temp_delete_${env}_${Date.now()}.env`;
    const pullResult = run(`bun vercel env pull ${tempFile} --environment ${env}`, true);

    if (pullResult !== null && require("fs").existsSync(tempFile)) {
      // Successfully pulled values
      const content = require("fs").readFileSync(tempFile, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...rest] = trimmed.split("=");
          const value = rest.join("=").trim().replace(/^"|"$/g, "");

          if (key && value !== undefined && !isSystemVariable(key, env)) {
            if (!envVarsMap[key]) {
              envVarsMap[key] = {
                name: key,
                environments: [],
                value: value.length > 100 ? value.substring(0, 97) + "..." : value
              };
            }
            if (!envVarsMap[key].environments.includes(env)) {
              envVarsMap[key].environments.push(env);
            }
          }
        }
      }

      // Clean up temp file
      require("fs").unlinkSync(tempFile);
      console.log(`    ✅ Loaded ${Object.keys(envVarsMap).length} variables with values`);
    } else {
      // Fallback to list command
      console.log(`    ⚠️ Could not pull values, using list command...`);
      const listResult = run(`bun vercel env ls ${env}`, true);

      if (listResult) {
        const lines = listResult.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
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

            if (
              varName &&
              varName !== "name" &&
              !varName.startsWith("`") &&
              !varName.startsWith("vercel") &&
              varName.match(/^[A-Z_][A-Z0-9_]*$/i) &&
              !isSystemVariable(varName, env)
            ) {
              if (!envVarsMap[varName]) {
                envVarsMap[varName] = {
                  name: varName,
                  environments: [],
                  value: "[ENCRYPTED]"
                };
              }
              if (!envVarsMap[varName].environments.includes(env)) {
                envVarsMap[varName].environments.push(env);
              }
            }
          }
        }
        console.log(`    📋 Found ${Object.keys(envVarsMap).length} variables (encrypted)`);
      }
    }
  }

  return Object.values(envVarsMap);
};

const selectEnvironments = async (): Promise<Environment[]> => {
  const environments = await p.multiselect<any[], any>({
    message: "🌍 Select environments to delete variables from:",
    options: [
      {
        label: "🔧 Development",
        value: "development" as Environment,
        hint: "Delete from development environment"
      },
      {
        label: "🚀 Production",
        value: "production" as Environment,
        hint: "Delete from production environment"
      }
    ],
    initialValues: [], // Nothing selected by default for safety
    required: true
  });

  if (isCancel(environments)) {
    cancel("👋 Operation cancelled");
    process.exit(0);
  }

  if (environments.length === 0) {
    p.log.error("Please select at least one environment.");
    return await selectEnvironments();
  }

  return environments as Environment[];
};

const formatVariableDescription = (variable: EnvVariable): string => {
  const envIcons = variable.environments
    .map((env) => (env === "development" ? "🔧" : "🚀"))
    .join(" ");

  let description = `${envIcons} ${variable.name}`;
  description += ` (${variable.environments.join(", ")})`;

  if (variable.value && variable.value !== "[ENCRYPTED]") {
    description += `\n     Value: "${variable.value}"`;
  } else if (variable.value === "[ENCRYPTED]") {
    description += `\n     Value: [ENCRYPTED]`;
  }

  return description;
};

const selectVariablesToDelete = async (variables: EnvVariable[]): Promise<EnvVariable[] | null> => {
  if (variables.length === 0) {
    p.log.info("ℹ️  No environment variables found to delete.");
    return [];
  }

  // Sort variables by name for better UX
  const sortedVariables = [...variables].sort((a, b) => a.name.localeCompare(b.name));

  const options = [
    {
      label: "❌ Exit - Cancel deletion and exit",
      value: "__exit__",
      hint: "Cancel the entire operation"
    },
    ...sortedVariables.map((variable) => ({
      label: formatVariableDescription(variable),
      value: variable.name,
      hint: `Environments: ${variable.environments.join(", ")}`
    }))
  ];

  const selectedNames = await p.multiselect<any[], any>({
    message: "🗑️ Select environment variables to DELETE:",
    options: options,
    initialValues: [], // Nothing selected by default for safety
    required: false
  });

  if (isCancel(selectedNames)) {
    cancel("👋 Operation cancelled");
    return null;
  }

  // Check if user selected exit option
  if (selectedNames.includes("__exit__")) {
    p.outro("👋 Operation cancelled by user");
    return null;
  }

  if (selectedNames.length === 0) {
    return [];
  }

  // Return the actual variable objects based on selected names
  return sortedVariables.filter(variable => selectedNames.includes(variable.name)) as EnvVariable[];
};

const confirmDeletion = async (variables: EnvVariable[]): Promise<{ proceed: boolean; deleteLocal: boolean } | null> => {
  const totalDeletions = variables.reduce((sum, variable) => sum + variable.environments.length, 0);

  p.log.warn("⚠️  DANGER ZONE - PERMANENT DELETION");
  p.log.warn("=====================================");
  p.log.warn(
    `You are about to permanently delete ${variables.length} variable(s) from ${totalDeletions} environment(s):`
  );

  variables.forEach((variable, index) => {
    const envIcons = variable.environments
      .map((env) => (env === "development" ? "🔧" : "🚀"))
      .join(" ");
    p.log.warn(
      `  ${index + 1}. ${envIcons} ${variable.name} (${variable.environments.join(", ")})`
    );
  });

  p.log.error("🚨 THIS ACTION CANNOT BE UNDONE! 🚨");

  // Create a detailed message showing the variables to be deleted
  const variablesList = variables.map((variable, index) => {
    const envIcons = variable.environments
      .map((env) => (env === "development" ? "🔧" : "🚀"))
      .join(" ");
    return `${index + 1}. ${envIcons} ${variable.name} (${variable.environments.join(", ")})`;
  }).join('\n');

  const proceed = await p.confirm({
    message: `Are you absolutely sure you want to delete these variables?\n\n${variablesList}\n\n🚨 THIS ACTION CANNOT BE UNDONE! 🚨`,
    initialValue: false
  });

  if (isCancel(proceed)) {
    cancel("👋 Operation cancelled");
    return null;
  }

  if (!proceed) {
    return { proceed: false, deleteLocal: false };
  }

  // Ask about local deletion
  const deleteLocal = await p.confirm({
    message: "Also delete these variables from local environment files (.env.local, .env.prod)?",
    initialValue: false
  });

  if (isCancel(deleteLocal)) {
    cancel("👋 Operation cancelled");
    return null;
  }

  return { proceed: true, deleteLocal };
};

const deleteVercelEnvVar = async (variable: EnvVariable): Promise<boolean> => {
  const { name, environments } = variable;
  console.log(`\n🗑️  Deleting ${name} from Vercel environments: ${environments.join(", ")}`);

  let success = true;
  for (const env of environments) {
    const envIcon = env === "development" ? "🔧" : "🚀";
    console.log(`  ${envIcon} Deleting from Vercel ${env}...`);

    const result = run(`bun vercel env rm ${name} ${env} -y`, false);
    if (result === null) {
      console.error(`  ❌ Failed to delete ${name} from Vercel ${env}`);
      success = false;
    } else {
      console.log(`  ✅ Deleted ${name} from Vercel ${env}`);
    }
  }

  return success;
};

const deleteLocalEnvVar = async (variable: EnvVariable): Promise<boolean> => {
  const { name, environments } = variable;
  console.log(`\n🗑️  Deleting ${name} from local files...`);

  let success = true;
  
  for (const env of environments) {
    const envIcon = env === "development" ? "🔧" : "🚀";
    const localFile = env === "development" ? ".env.local" : ".env.prod";
    
    console.log(`  ${envIcon} Deleting from ${localFile}...`);

    try {
      if (require("fs").existsSync(localFile)) {
        const content = require("fs").readFileSync(localFile, "utf-8");
        const lines = content.split("\n");
        
        // Filter out the variable to delete
        const filteredLines = lines.filter((line: string) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return true;
          const [key] = trimmed.split("=");
          return key !== name;
        });
        
        // Write back the filtered content
        require("fs").writeFileSync(localFile, filteredLines.join("\n"), "utf-8");
        console.log(`  ✅ Deleted ${name} from ${localFile}`);
      } else {
        console.log(`  ⚠️  ${localFile} doesn't exist, skipping...`);
      }
    } catch (error) {
      console.error(`  ❌ Failed to delete ${name} from ${localFile}:`, error);
      success = false;
    }
  }

  return success;
};

/**
 * Delete environment variables from Vercel interactively
 * @param options - Configuration options for deletion
 */
export const deleteEnvs = async (options: DeleteEnvsOptions = {}): Promise<void> => {
  try {
    p.intro("🗑️  Interactive Vercel Environment Variable Deletion");
    
    // Handle cancellation gracefully
    process.on('SIGINT', () => {
      cancel('👋 Operation cancelled');
      process.exit(0);
    });

    // Check if Vercel CLI is available
    const vercelCheck = run("bun vercel --version", true);
    if (!vercelCheck) {
      p.log.error("❌ Vercel CLI not found. Please install it first:");
      p.log.error("   npm i -g vercel");
      process.exit(1);
    }

    p.log.success(`✅ Vercel CLI detected: ${vercelCheck.split("\n")[0]}`);

    // Step 1: Select environments
    const selectedEnvironments = options.environments || await selectEnvironments();
    p.log.info(
      `🎯 Selected environments: ${selectedEnvironments
        .map((env) => (env === "development" ? "🔧 Development" : "🚀 Production"))
        .join(", ")}`
    );

    // Step 2: Get environment variables from selected environments
    const variables = await getVercelEnvVars(selectedEnvironments);

    if (variables.length === 0) {
      p.log.info("ℹ️  No environment variables found in selected environments.");
      p.outro("👋 No variables to delete");
      return;
    }

    p.log.info(
      `📊 Found ${variables.length} environment variables across selected environments`
    );

    // Step 3: Let user select variables to delete (with loop for retry)
    let variablesToDelete: EnvVariable[] = [];
    let shouldExit = false;
    let confirmationResult: { proceed: boolean; deleteLocal: boolean } | null = null;

    while (variablesToDelete.length === 0 && !shouldExit) {
      const result = await selectVariablesToDelete(variables);
      
      if (result === null) {
        // User chose to exit
        shouldExit = true;
        break;
      }
      
      if (result.length === 0) {
        p.log.warn("No variables selected. Please select at least one variable or choose Exit.");
        continue;
      }

      variablesToDelete = result;

      // Step 4: Final confirmation
      if (!options.force) {
        confirmationResult = await confirmDeletion(variablesToDelete);
        if (!confirmationResult) {
          // User cancelled
          shouldExit = true;
          break;
        }
        
        if (!confirmationResult.proceed) {
          // User said no, go back to selection
          variablesToDelete = [];
          continue;
        }
        
        // If we reach here, user confirmed deletion
        break;
      } else {
        // Force mode - set default confirmation
        confirmationResult = { proceed: true, deleteLocal: false };
        break;
      }
    }

    if (shouldExit) {
      p.outro("👋 Operation cancelled by user");
      return;
    }

    // Step 5: Delete selected variables
    p.log.info("🔄 Starting deletion process...");
    let vercelSuccessCount = 0;
    let localSuccessCount = 0;
    let vercelFailureCount = 0;
    let localFailureCount = 0;

    for (const variable of variablesToDelete) {
      // Always delete from Vercel
      const vercelSuccess = await deleteVercelEnvVar(variable);
      if (vercelSuccess) {
        vercelSuccessCount++;
      } else {
        vercelFailureCount++;
      }

      // Delete from local files if requested
      if (confirmationResult && confirmationResult.deleteLocal) {
        const localSuccess = await deleteLocalEnvVar(variable);
        if (localSuccess) {
          localSuccessCount++;
        } else {
          localFailureCount++;
        }
      }
    }

    // Step 6: Summary
    p.log.info("📊 Deletion Summary:");
    p.log.info("===================");
    p.log.success(`✅ Vercel: Successfully deleted ${vercelSuccessCount} variables`);
    if (vercelFailureCount > 0) {
      p.log.error(`❌ Vercel: Failed to delete ${vercelFailureCount} variables`);
    }
    
    if (confirmationResult && confirmationResult.deleteLocal) {
      p.log.success(`✅ Local: Successfully deleted ${localSuccessCount} variables`);
      if (localFailureCount > 0) {
        p.log.error(`❌ Local: Failed to delete ${localFailureCount} variables`);
      }
    }

    const totalFailures = vercelFailureCount + localFailureCount;
    if (totalFailures === 0) {
      p.outro("🎉 All selected environment variables have been successfully deleted!");
    } else {
      p.log.error("⚠️  Some deletions failed. Please check the errors above.");
      process.exit(1);
    }
  } catch (error) {
    p.log.error(`💥 Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  }
};

// CLI wrapper for backwards compatibility
const main = async () => {
  const args = process.argv.slice(2);
  const forceDelete = args.includes("--force") || args.includes("-f");
  const interactiveMode = args.includes("--interactive") || args.includes("-i");

  if (forceDelete) {
    console.log("⚠️  --force flag detected. Use the interactive mode for safer deletion:");
    console.log("  npx @pidchashyi/vercel-env --delete");
    process.exit(0);
  } else if (interactiveMode || args.length === 0) {
    await deleteEnvs();
  } else {
    console.log("🗑️  Interactive Vercel Environment Variable Deletion");
    console.log("===================================================");
    console.log("");
    console.log("This script provides a safe, interactive way to delete environment variables from Vercel.");
    console.log("");
    console.log("Usage:");
    console.log("  npx @pidchashyi/vercel-env --delete    # Interactive mode (recommended)");
    console.log("");
    console.log("Features:");
    console.log("  🌍 Select specific environments (development/production)");
    console.log("  📋 Choose individual variables to delete");
    console.log("  🔍 Preview variable values before deletion");
    console.log("  ✅ Safe confirmation prompts");
    console.log("  🚨 Multiple safety checks to prevent accidents");
  }
};

// Handle process termination gracefully
process.on("SIGINT", () => {
  console.log("\n👋 Deletion cancelled by user");
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
