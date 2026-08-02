import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesRoot = join(repositoryRoot, 'packages');
const ignoredDirectories = new Set(['dist', 'node_modules', '.turbo']);
const misplacedTestArtifacts = [];
const invalidTestNames = [];
const legacyTestDirectories = [];

function isTestArtifact(fileName, parentDirectory) {
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(fileName) ||
    (parentDirectory === '__snapshots__' && fileName.endsWith('.snap'))
  );
}

function inspectDirectory(packageRoot, directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === '__tests__') {
        legacyTestDirectories.push(relative(repositoryRoot, entryPath));
      }
      inspectDirectory(packageRoot, entryPath);
      continue;
    }

    if (!isTestArtifact(entry.name, relative(packageRoot, directory).split(sep).at(-1))) continue;

    const packageRelativePath = relative(packageRoot, entryPath);
    if (/\.spec\.[cm]?[jt]sx?$/.test(entry.name)) {
      invalidTestNames.push(relative(repositoryRoot, entryPath));
    }
    if (packageRelativePath.split(sep)[0] !== '__test__') {
      misplacedTestArtifacts.push(relative(repositoryRoot, entryPath));
    }
  }
}

for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (entry.isDirectory())
    inspectDirectory(join(packagesRoot, entry.name), join(packagesRoot, entry.name));
}

if (
  misplacedTestArtifacts.length > 0 ||
  invalidTestNames.length > 0 ||
  legacyTestDirectories.length > 0
) {
  if (legacyTestDirectories.length > 0) {
    console.error('Use __test__/ instead of legacy tests/ or __tests__/ directories:');
    for (const directoryPath of legacyTestDirectories.sort()) console.error(`- ${directoryPath}`);
  }
  if (invalidTestNames.length > 0) {
    console.error('Test files must use the *.test.ts or *.test.tsx suffix:');
    for (const filePath of invalidTestNames.sort()) console.error(`- ${filePath}`);
  }
  if (misplacedTestArtifacts.length > 0) {
    console.error('Test files and snapshots must live under packages/<package>/__test__/:');
    for (const filePath of misplacedTestArtifacts.sort()) console.error(`- ${filePath}`);
  }
  process.exitCode = 1;
} else {
  console.log('Project structure check passed.');
}
