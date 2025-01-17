import { ContentExtractor } from '../../content/ContentExtractor';

describe('ContentExtractor', () => {
    let originalDocument: Document;

    beforeEach(() => {
        // Store original document
        originalDocument = document;
        
        // Reset the document body
        document.body.innerHTML = '';
    });

    afterEach(() => {
        // Restore original document
        document = originalDocument;
    });

    describe('extract()', () => {
        it('should extract selected text when available', () => {
            // Setup
            document.body.innerHTML = '<div>Some text <span>selected text</span> more text</div>';
            const selection = window.getSelection();
            const span = document.querySelector('span')!;
            const range = document.createRange();
            range.selectNodeContents(span);
            selection?.removeAllRanges();
            selection?.addRange(range);

            // Test
            const result = ContentExtractor.extract();
            expect(result.content).toBe('selected text');
        });

        it('should extract from article tag when no selection', () => {
            // Setup
            document.body.innerHTML = `
                <header>Header content</header>
                <article>Main article content</article>
                <footer>Footer content</footer>
            `;

            // Test
            const result = ContentExtractor.extract();
            expect(result.content).toBe('Main article content');
        });

        it('should extract from main tag when no article tag', () => {
            // Setup
            document.body.innerHTML = `
                <header>Header content</header>
                <main>Main content</main>
                <footer>Footer content</footer>
            `;

            // Test
            const result = ContentExtractor.extract();
            expect(result.content).toBe('Main content');
        });

        it('should extract from body when no article or main tag', () => {
            // Setup
            document.body.innerHTML = `
                <div>Some content</div>
                <script>console.log('script');</script>
                <style>.class { color: red; }</style>
            `;

            // Test
            const result = ContentExtractor.extract();
            expect(result.content).toBe('Some content');
        });

        it('should include page title in result', () => {
            // Setup
            document.title = 'Test Page Title';
            document.body.innerHTML = '<div>Some content</div>';

            // Test
            const result = ContentExtractor.extract();
            expect(result.title).toBe('Test Page Title');
            expect(result.content).toBe('Some content');
        });

        it('should handle empty content gracefully', () => {
            // Setup
            document.body.innerHTML = '';

            // Test
            const result = ContentExtractor.extract();
            expect(result.content).toBe('');
        });

        it('should remove scripts and styles from body content', () => {
            // Setup
            document.body.innerHTML = `
                <div>Visible content</div>
                <script>console.log('hidden');</script>
                <style>.hidden { display: none; }</style>
                <noscript>JavaScript is disabled</noscript>
            `;

            // Test
            const result = ContentExtractor.extract();
            expect(result.content).toBe('Visible content');
        });
    });
}); 