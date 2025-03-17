#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Check Node.js version
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0], 10);

if (majorVersion < 14) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: Node.js version 14.16.0 or higher is required.');
  process.exit(1);
}

// Make cli.js executable (Unix systems)
try {
  if (process.platform !== 'win32') {
    const cliPath = path.resolve(process.cwd(), 'bin', 'cli.js');
    if (fs.existsSync(cliPath)) {
      execSync(`chmod +x "${cliPath}"`);
    }
  }
} catch (error) {
  console.warn('\x1b[33m%s\x1b[0m', 'Warning: Could not make CLI executable.');
}

console.log('\x1b[32m%s\x1b[0m', 'Installation completed! Run with: kick-dl');