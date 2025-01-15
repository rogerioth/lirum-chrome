import { watch } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_PATH = join(__dirname, '..', 'dist');

console.log('Watching for extension changes...');

// Watch the dist directory for changes
watch(DIST_PATH, { recursive: true }, (eventType, filename) => {
  if (filename) {
    console.log(`Changes detected in ${filename}`);
    console.log('Please refresh the extension in Chrome:');
    console.log('1. Go to chrome://extensions');
    console.log('2. Find "Lirum Chrome LLMs"');
    console.log('3. Click the refresh icon');
  }
}); 