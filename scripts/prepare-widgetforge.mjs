import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const widgetForgePath = resolve(repositoryRoot, 'node_modules', 'widgetforge');
const widgetForgeDistPath = resolve(widgetForgePath, 'dist');

if (!existsSync(widgetForgePath)) {
  throw new Error('WidgetForge is not installed. Run npm install before the client checks.');
}

if (!existsSync(resolve(widgetForgeDistPath, 'index.js')) || !existsSync(resolve(widgetForgeDistPath, 'index.d.ts'))) {
  if (!existsSync(resolve(widgetForgePath, 'src', 'index.ts'))) {
    throw new Error('The WidgetForge repository dependency does not contain a buildable public package.');
  }

  const npmArguments = [
    'install',
    '--include=dev',
    '--ignore-scripts',
    '--no-package-lock',
  ];
  runNpm(npmArguments, widgetForgePath);
  runNpm(['run', 'build'], widgetForgePath);
}

if (!existsSync(resolve(widgetForgeDistPath, 'index.js')) || !existsSync(resolve(widgetForgeDistPath, 'index.d.ts'))) {
  throw new Error('WidgetForge did not produce its public dist entrypoint.');
}

// WidgetForge declares Vue as a peer. Remove the dependency install used only
// to build the Git checkout so the demo and library share the app's Vue copy.
const nestedDependenciesPath = resolve(widgetForgePath, 'node_modules');
if (existsSync(nestedDependenciesPath)) rmSync(nestedDependenciesPath, { recursive: true, force: true });

function runNpm(args, cwd) {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], {
      cwd,
      stdio: 'inherit',
    });
    return;
  }
  execFileSync('npm', args, { cwd, stdio: 'inherit' });
}
