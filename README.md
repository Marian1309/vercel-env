# @pidchashyi/vercel-env

A comprehensive library and CLI tool for syncing environment variables between local files and Vercel. This tool provides both programmatic access through named modules (`deleteEnvs` and `syncEnvs`) and a convenient CLI interface.

## 📖 What is this?

**@pidchashyi/vercel-env** solves the common problem of keeping environment variables synchronized between your local development environment and your Vercel deployments. Instead of manually copying variables back and forth, this tool provides:

### 🎯 **The Problem It Solves:**
- **Manual sync headaches**: Copying environment variables between local `.env` files and Vercel dashboard
- **Deployment mismatches**: Local and production environments getting out of sync
- **Time-consuming setup**: Setting up new team members or environments
- **Human errors**: Typos, missing variables, or incorrect values during manual copying
- **No version control**: Environment variables aren't tracked or easily managed

### 💡 **The Solution:**
- **Bidirectional sync**: Automatically sync between local files (`.env.local`, `.env.prod`) and Vercel environments
- **Interactive interface**: Choose exactly what to sync, update, add, or delete
- **Safety first**: Multiple confirmation prompts and smart exclusion lists
- **Developer-friendly**: Both CLI commands and TypeScript library for automation
- **Smart detection**: Automatically detects differences and suggests actions

### 🔧 **How It Works:**
1. **Connects** to your Vercel project using the official Vercel CLI
2. **Compares** your local environment files with Vercel's environment variables
3. **Shows differences** in an easy-to-understand format
4. **Lets you choose** what to sync, add, update, or delete
5. **Applies changes** safely with confirmation prompts
6. **Reports results** so you know exactly what happened

### 👥 **Perfect For:**
- **Developers** who work with Vercel deployments
- **Teams** that need consistent environment setups
- **DevOps** automation and CI/CD pipelines
- **Projects** with multiple environments (dev, staging, prod)
- **Anyone** tired of manually managing environment variables

## 🚀 Features

- **Two-way sync** between local `.env` files and Vercel environments
- **Interactive deletion** of environment variables with safety checks
- **CLI interface** with `--sync` and `--delete` flags
- **Library modules** for programmatic usage
- **TypeScript support** with full type definitions
- **Environment-specific** operations (development/production)
- **Safety features** including confirmation prompts and exclusion lists
- **Flexible configuration** with multiple sync modes

## 📋 Prerequisites

Before using this library, you need to set up Vercel CLI and authenticate:

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Link your project

Navigate to your project directory and link it to your Vercel project:

```bash
vercel link
```

This will create a `.vercel` folder in your project with the necessary configuration.

### 4. Verify setup

Test that everything is working:

```bash
vercel env ls development
vercel env ls production
```

## 🛠️ Installation

### As a CLI tool (global):

```bash
npm install -g @pidchashyi/vercel-env
```

**✨ Global installation gives you easier commands:**
After global installation, you can use the shorter `vercel-env` command directly:

```bash
# Easy commands (after global install)
vercel-env --sync           # Instead of npx @pidchashyi/vercel-env --sync
vercel-env --delete         # Instead of npx @pidchashyi/vercel-env --delete
vercel-env --sync --dev     # Instead of npx @pidchashyi/vercel-env --sync --dev
vercel-env --delete --prod  # Instead of npx @pidchashyi/vercel-env --delete --prod
```

### As a library (local):

```bash
npm install @pidchashyi/vercel-env
# or
yarn add @pidchashyi/vercel-env
# or
bun add @pidchashyi/vercel-env
```

## 🏃‍♂️ CLI Usage

### Sync environments

```bash
# If installed globally (easier):
vercel-env --sync                    # Interactive mode - choose everything
vercel-env --sync --dev              # Sync development only (interactive)
vercel-env --sync --prod             # Sync production only (interactive)
vercel-env --sync --dev --auto       # Auto sync development (with confirmation)
vercel-env --sync --auto             # Auto sync both environments

# If installed locally (using npx):
npx @pidchashyi/vercel-env --sync         # Interactive mode - choose everything
npx @pidchashyi/vercel-env --sync --dev   # Sync development only (interactive)
npx @pidchashyi/vercel-env --sync --prod  # Sync production only (interactive)
npx @pidchashyi/vercel-env --sync --dev --auto  # Auto sync development
npx @pidchashyi/vercel-env --sync --auto  # Auto sync both environments
```

### Delete environment variables

```bash
# If installed globally (easier):
vercel-env --delete                  # Interactive deletion (recommended)
vercel-env --delete --dev            # Delete from development
vercel-env --delete --prod           # Delete from production

# If installed locally (using npx):
npx @pidchashyi/vercel-env --delete       # Interactive deletion (recommended)
npx @pidchashyi/vercel-env --delete --dev # Delete from development
npx @pidchashyi/vercel-env --delete --prod # Delete from production
```

> 💡 **Tip**: In interactive mode, you'll see a "❌ Do Nothing - Exit" option that lets you exit safely without making any changes!

## 📚 Library Usage

You can use this library in two ways:

### 1. Import as Library Modules

```typescript
import { syncEnvs, deleteEnvs } from '@pidchashyi/vercel-env';

// Interactive sync (default)
await syncEnvs();

// Auto sync specific environments
await syncEnvs({
  environments: ['development'],
  mode: 'auto'
});

// Delete environment variables
await deleteEnvs({
  environments: ['development']
});
```

### 2. Run Modules Directly with Bun

You can also run the individual module files directly:

```bash
# Run sync module directly
bun node_modules/@pidchashyi/vercel-env/src/sync.ts

# Run delete module directly  
bun node_modules/@pidchashyi/vercel-env/src/delete-all.ts

# Or if installed globally
bun ~/.bun/install/global/node_modules/@pidchashyi/vercel-env/src/sync.ts
bun ~/.bun/install/global/node_modules/@pidchashyi/vercel-env/src/delete-all.ts
```

### 3. Local Development (if you have the source)

```bash
# Clone and run directly from source
git clone <repository-url>
cd vercel-env

# Run sync module
bun src/sync.ts

# Run delete module  
bun src/delete-all.ts

# With command line arguments
bun src/sync.ts --dev --auto
bun src/delete-all.ts --interactive
```

### 4. Using NPM Scripts (after installation)

The package includes convenient npm scripts:

```bash
# Basic operations
npm run sync          # Interactive sync
npm run delete        # Interactive delete

# Environment-specific operations  
npm run sync:dev      # Auto sync development
npm run sync:prod     # Interactive sync production
npm run delete:dev    # Delete from development
npm run delete:prod   # Delete from production
```

## 🔧 Configuration

The library works with the following local files:

- **Development**: `.env.local` ↔ Vercel development environment
- **Production**: `.env.prod` ↔ Vercel production environment

### Excluded Variables

Some variables are automatically excluded from being pulled from Vercel to local files:

**All environments:**
- `VERCEL_OIDC_TOKEN`
- `VERCEL_URL`
- `VERCEL_ENV`
- `VERCEL_REGION`

**Production only:**
- `NX_DAEMON`
- `TURBO_CACHE`
- `TURBO_DOWNLOAD_LOCAL_ENABLED`
- `TURBO_REMOTE_ONLY`
- `TURBO_RUN_SUMMARY`
- `VERCEL`
- `VERCEL_TARGET_ENV`

## 📦 Project Structure

```
src/
├── cli.ts          # CLI interface
├── delete-all.ts   # deleteEnvs module
├── sync.ts         # syncEnvs module
├── types.ts        # TypeScript type definitions
└── index.ts        # Main library exports
```

## 🔄 How it works

### Sync Process

1. **Fetch** environment variables from both local files and Vercel
2. **Compare** values and identify differences
3. **Present options** for each difference (add, update, pull, or delete)
4. **Apply changes** based on user selection or auto mode
5. **Report** success/failure for each operation

### Delete Process

1. **Fetch** environment variables from selected Vercel environments
2. **Display** variables with their values (when possible)
3. **Allow selection** of variables to delete
4. **Confirm** deletion with safety prompts
5. **Execute** deletions and report results

## 🎮 Interactive Features

### Smart Exit Option

When using **interactive sync mode**, you'll see a convenient "Do Nothing" option that allows you to exit gracefully without making any changes:

```
🔄 Select environment variables to sync:
◉ ➕ ADD DATABASE_URL → Vercel (development)
◉ 🔄 UPDATE API_KEY → Vercel (development) 
◉ ⬇️ PULL SECRET_TOKEN ← Vercel (development)
────────────────────────────────────────
◯ ❌ Do Nothing - Exit without making any changes
```

**Benefits:**
- **Safe exit**: No need to press Ctrl+C or force quit
- **Clear separation**: Visual separator between real options and exit option
- **Graceful handling**: Shows friendly message when exiting
- **No changes**: Guaranteed to leave both local files and Vercel untouched

**Usage:**
- Use ↑↓ arrows to navigate
- Press `Space` to select/deselect the "Do Nothing" option
- Press `Enter` to confirm your choice
- If "Do Nothing" is selected, the sync exits immediately with a friendly message

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 👏 Acknowledgments

- [Vercel](https://vercel.com) - For providing excellent deployment platform
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) - For interactive CLI prompts
