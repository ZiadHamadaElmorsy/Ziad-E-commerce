const { execSync } = require('child_process');
const fs = require('fs');

let report = '';

try {
  report += '=== API UNIT TESTS ===\n';
  const apiOut = execSync('npx jest --passWithNoTests --forceExit', { cwd: 'apps/api', encoding: 'utf8' });
  report += apiOut + '\n';
} catch (err) {
  report += 'API Test Error:\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n';
}

try {
  report += '=== WEB UNIT TESTS ===\n';
  const webOut = execSync('npx vitest run', { cwd: 'apps/web', encoding: 'utf8' });
  report += webOut + '\n';
} catch (err) {
  report += 'Web Test Error:\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n';
}

try {
  report += '=== API TYPECHECK ===\n';
  const apiTc = execSync('npx tsc --noEmit', { cwd: 'apps/api', encoding: 'utf8' });
  report += 'API Typecheck Success\n';
} catch (err) {
  report += 'API Typecheck Error:\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n';
}

try {
  report += '=== WEB TYPECHECK ===\n';
  const webTc = execSync('npx tsc --noEmit', { cwd: 'apps/web', encoding: 'utf8' });
  report += 'Web Typecheck Success\n';
} catch (err) {
  report += 'Web Typecheck Error:\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n';
}

fs.writeFileSync('test-run-report.txt', report, 'utf8');
console.log('Report written to test-run-report.txt');
