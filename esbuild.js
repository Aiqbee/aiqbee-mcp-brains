const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Determine environment from --mode flag (eudev or euprod)
const modeArg = process.argv.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'eudev';
const envFile = path.resolve(__dirname, `.env.${mode}`);

// Parse .env file into key-value pairs — fail fast if missing during production build
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    if (production) {
      throw new Error(`Missing environment file: ${filePath}`);
    }
    console.warn(`Warning: ${filePath} not found, using defaults`);
    return {};
  }
  const vars = {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    }
  }
  return vars;
}

const envVars = loadEnvFile(envFile);

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    define: {
      'process.env.VITE_API_URL': JSON.stringify(envVars.VITE_API_URL || 'https://api.aiqbee.com'),
      'process.env.VITE_APP_URL': JSON.stringify(envVars.VITE_APP_URL || 'https://app.aiqbee.com'),
      'process.env.VITE_MSAL_CLIENT_ID': JSON.stringify(envVars.VITE_MSAL_CLIENT_ID || ''),
      'process.env.VITE_ENTRA_SCOPES': JSON.stringify(envVars.VITE_ENTRA_SCOPES || ''),
      'process.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(envVars.VITE_GOOGLE_CLIENT_ID || ''),
    },
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
