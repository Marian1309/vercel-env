# @pidchashyi/vercel-env-sync

A comprehensive library and CLI tool for syncing environment variables between local files and Vercel. This tool provides both programmatic access through named modules (`deleteEnvs` and `syncEnvs`) and a convenient CLI interface.

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
npm install -g @pidchashyi/vercel-env-sync
```

### As a library (local):

```bash
npm install @pidchashyi/vercel-env-sync
# or
yarn add @pidchashyi/vercel-env-sync
# or
bun add @pidchashyi/vercel-env-sync
```

## 🏃‍♂️ CLI Usage

### Sync environments

```bash
# Interactive mode - choose everything
npx @pidchashyi/vercel-env-sync --sync

# Sync development only (interactive)
npx @pidchashyi/vercel-env-sync --sync --dev

# Sync production only (interactive)
npx @pidchashyi/vercel-env-sync --sync --prod

# Auto sync development (with confirmation)
npx @pidchashyi/vercel-env-sync --sync --dev --auto

# Auto sync both environments
npx @pidchashyi/vercel-env-sync --sync --auto
```

### Delete environment variables

```bash
# Interactive deletion (recommended)
npx @pidchashyi/vercel-env-sync --delete

# Delete from specific environments
npx @pidchashyi/vercel-env-sync --delete --dev
npx @pidchashyi/vercel-env-sync --delete --prod
```

## 📚 Library Usage

You can use this library in two ways:

### 1. Import as Library Modules

```typescript
import { syncEnvs, deleteEnvs } from '@pidchashyi/vercel-env-sync';

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
bun node_modules/@pidchashyi/vercel-env-sync/src/sync.ts

# Run delete module directly  
bun node_modules/@pidchashyi/vercel-env-sync/src/delete-all.ts

# Or if installed globally
bun ~/.bun/install/global/node_modules/@pidchashyi/vercel-env-sync/src/sync.ts
bun ~/.bun/install/global/node_modules/@pidchashyi/vercel-env-sync/src/delete-all.ts
```

### 3. Local Development (if you have the source)

```bash
# Clone and run directly from source
git clone <repository-url>
cd vercel-env-sync

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

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 👏 Acknowledgments

- [Vercel](https://vercel.com) - For providing excellent deployment platform
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) - For interactive CLI prompts
