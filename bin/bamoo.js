#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch(e => {
  console.error('\n' + (e?.stack ?? e));
  process.exit(1);
});
