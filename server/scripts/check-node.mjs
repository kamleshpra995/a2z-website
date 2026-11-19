// Plain JavaScript on purpose: this must run (and explain the problem) on any Node.js version.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  console.error(
    `\nA2Z server needs Node.js 22.6 or newer to run TypeScript directly (found ${process.version}).\n` +
      'Install a current Node.js 22, e.g. with nvm:  nvm install 22 && nvm use 22\n',
  );
  process.exit(1);
}
