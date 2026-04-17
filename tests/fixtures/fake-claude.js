#!/usr/bin/env node
// Deterministic stand-in for the `claude` CLI used by tests.
// - Prints a banner on start.
// - Echoes each line of stdin back, prefixed with "ECHO: ".
// - Recognizes control tokens:
//     __exit__   -> exit 0
//     __crash__  -> exit 7
//     __big__    -> emit 256 KB of 'x' followed by a newline
process.stdout.write('FAKE-CLAUDE READY\r\n');

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).replace(/\r$/, '');
    buf = buf.slice(nl + 1);
    if (line === '__exit__') process.exit(0);
    if (line === '__crash__') process.exit(7);
    if (line === '__big__') {
      process.stdout.write('x'.repeat(256 * 1024) + '\r\n');
      continue;
    }
    process.stdout.write(`ECHO: ${line}\r\n`);
  }
});

process.stdin.on('end', () => process.exit(0));
