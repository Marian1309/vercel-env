import { execSync } from "child_process";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import inquirer from "inquirer";
import type { Environment, EnvVariable, DeleteChoice, DeleteEnvsOptions } from './types.js';

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

          if (key && value !== undefined) {
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
              varName.match(/^[A-Z_][A-Z0-9_]*$/i)
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
  const answer = await inquirer.prompt([
    {
      type: "checkbox",
      name: "environments",
      message: "🌍 Select environments to delete variables from:",
      choices: [
        {
          name: "🔧 Development - Delete from development environment",
          value: "development" as Environment,
          checked: false
        },
        {
          name: "🚀 Production - Delete from production environment",
          value: "production" as Environment,
          checked: false
        }
      ],
      validate: (input) => {
        if (input.length === 0) {
          return "Please select at least one environment.";
        }
        return true;
      }
    }
  ]);

  return answer.environments;
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

const selectVariablesToDelete = async (variables: EnvVariable[]): Promise<EnvVariable[]> => {
  if (variables.length === 0) {
    console.log("ℹ️  No environment variables found to delete.");
    return [];
  }

  // Sort variables by name for better UX
  const sortedVariables = [...variables].sort((a, b) => a.name.localeCompare(b.name));

  const choices: DeleteChoice[] = sortedVariables.map((variable) => ({
    name: formatVariableDescription(variable),
    value: variable,
    checked: false // Default to not selected for safety
  }));

  const answers = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedVariables",
      message:
        "🗑️ Select environment variables to DELETE (use ↑↓ arrows, space to select/deselect, enter to confirm):",
      choices: choices,
      pageSize: 15,
      loop: false,
      validate: (input) => {
        if (input.length === 0) {
          return "Please select at least one variable to delete, or press Ctrl+C to cancel.";
        }
        return true;
      }
    }
  ]);

  return answers.selectedVariables as EnvVariable[];
};

const confirmDeletion = async (variables: EnvVariable[]): Promise<boolean> => {
  const totalDeletions = variables.reduce((sum, variable) => sum + variable.environments.length, 0);

  console.log("\n⚠️  DANGER ZONE - PERMANENT DELETION");
  console.log("=====================================");
  console.log(
    `You are about to permanently delete ${variables.length} variable(s) from ${totalDeletions} environment(s):`
  );

  variables.forEach((variable, index) => {
    const envIcons = variable.environments
      .map((env) => (env === "development" ? "🔧" : "🚀"))
      .join(" ");
    console.log(
      `  ${index + 1}. ${envIcons} ${variable.name} (${variable.environments.join(", ")})`
    );
  });

  console.log("\n🚨 THIS ACTION CANNOT BE UNDONE! 🚨");

  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Are you absolutely sure you want to delete these variables?",
      default: false
    }
  ]);

  return answer.proceed;
};

const deleteVercelEnvVar = async (variable: EnvVariable): Promise<boolean> => {
  const { name, environments } = variable;
  console.log(`\n🗑️  Deleting ${name} from environments: ${environments.join(", ")}`);

  let success = true;
  for (const env of environments) {
    const envIcon = env === "development" ? "🔧" : "🚀";
    console.log(`  ${envIcon} Deleting from ${env}...`);

    const result = run(`bun vercel env rm ${name} ${env} -y`, false);
    if (result === null) {
      console.error(`  ❌ Failed to delete ${name} from ${env}`);
      success = false;
    } else {
      console.log(`  ✅ Deleted ${name} from ${env}`);
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
    console.log("🗑️  Interactive Vercel Environment Variable Deletion\n");

    // Check if Vercel CLI is available
    const vercelCheck = run("bun vercel --version", true);
    if (!vercelCheck) {
      console.error("❌ Vercel CLI not found. Please install it first:");
      console.error("   npm i -g vercel");
      process.exit(1);
    }

    console.log(`✅ Vercel CLI detected: ${vercelCheck.split("\n")[0]}\n`);

    // Step 1: Select environments
    const selectedEnvironments = options.environments || await selectEnvironments();
    console.log(
      `\n🎯 Selected environments: ${selectedEnvironments
        .map((env) => (env === "development" ? "🔧 Development" : "🚀 Production"))
        .join(", ")}\n`
    );

    // Step 2: Get environment variables from selected environments
    const variables = await getVercelEnvVars(selectedEnvironments);

    if (variables.length === 0) {
      console.log("ℹ️  No environment variables found in selected environments.");
      return;
    }

    console.log(
      `\n📊 Found ${variables.length} environment variables across selected environments\n`
    );

    // Step 3: Let user select variables to delete
    const variablesToDelete = await selectVariablesToDelete(variables);

    if (variablesToDelete.length === 0) {
      console.log("👋 No variables selected for deletion. Exiting...");
      return;
    }

    // Step 4: Final confirmation
    if (!options.force) {
      const confirmed = await confirmDeletion(variablesToDelete);
      if (!confirmed) {
        console.log("👋 Deletion cancelled by user. Exiting...");
        return;
      }
    }

    // Step 5: Delete selected variables
    console.log("\n🔄 Starting deletion process...\n");
    let successCount = 0;
    let failureCount = 0;

    for (const variable of variablesToDelete) {
      const success = await deleteVercelEnvVar(variable);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    // Step 6: Summary
    console.log("\n📊 Deletion Summary:");
    console.log("===================");
    console.log(`✅ Successfully deleted: ${successCount} variables`);
    if (failureCount > 0) {
      console.log(`❌ Failed to delete: ${failureCount} variables`);
    }

    if (failureCount === 0) {
      console.log(
        "\n🎉 All selected environment variables have been successfully deleted from Vercel!"
      );
    } else {
      console.log("\n⚠️  Some deletions failed. Please check the errors above.");
      process.exit(1);
    }
  } catch (error) {
    console.error("💥 Unexpected error:", error instanceof Error ? error.message : "Unknown error");
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
