import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';

const gitBranch = execSync('git branch --show-current').toString().trim();

if (gitBranch !== 'develop') {
  console.log(
    styleText('yellow', `Current branch is ${gitBranch}, skipping version update`),
  );
  process.exit(0);
}

const packageJsonPath = path.resolve('package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const packageName = packageJson.name;

let nextVersion: string | null = null;
try {
  const result = execSync(`npm view ${packageName}@next version`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  nextVersion = result.trim();
  console.log(styleText('blue', `Found latest next version: ${nextVersion}`));
} catch {}

if (!nextVersion) process.exit(0);

const prevVersion = packageJson.version;
packageJson.version = nextVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log(styleText('green', `Updated version from ${prevVersion} to ${nextVersion}`));
