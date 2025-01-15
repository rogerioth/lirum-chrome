import { ContentExtractor } from '../../content/ContentExtractor';

describe('ContentExtractor', () => {
  let contentExtractor: ContentExtractor;
  let mockDocument: Document;

  beforeEach(() => {
    // Set up a mock document
    document.body.innerHTML = '';
    contentExtractor = new ContentExtractor();
  });

  describe('Main Content Extraction', () => {
    it('should extract main article content', () => {
      document.body.innerHTML = `
        <article>
          <h1>Test Article</h1>
          <p>This is the main content.</p>
        </article>
        <div class="comments">
          <p>This is a comment.</p>
        </div>
      `;

      const content = contentExtractor.extractMainContent();
      expect(content).toContain('Test Article');
      expect(content).toContain('This is the main content');
      expect(content).not.toContain('This is a comment');
    });

    it('should handle pages without article tags', () => {
      document.body.innerHTML = `
        <div class="main-content">
          <h1>Test Page</h1>
          <p>This is the main content.</p>
        </div>
        <footer>Footer content</footer>
      `;

      const content = contentExtractor.extractMainContent();
      expect(content).toContain('Test Page');
      expect(content).toContain('This is the main content');
      expect(content).not.toContain('Footer content');
    });

    it('should handle dynamic content loading', async () => {
      document.body.innerHTML = '<div id="content"></div>';
      
      // Simulate dynamic content loading
      setTimeout(() => {
        document.getElementById('content')!.innerHTML = '<p>Dynamic content</p>';
      }, 100);

      const content = await contentExtractor.extractMainContentWithRetry();
      expect(content).toContain('Dynamic content');
    });
  });

  describe('Selected Text Extraction', () => {
    it('should extract selected text', () => {
      document.body.innerHTML = '<p>This is some text with a <span>selected portion</span> in it.</p>';
      
      // Mock selection using Range
      const range = document.createRange();
      const span = document.querySelector('span')!;
      range.selectNodeContents(span);
      
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);

      const selectedText = contentExtractor.extractSelectedText();
      expect(selectedText).toBe('selected portion');
    });

    it('should return null when no text is selected', () => {
      document.body.innerHTML = '<p>This is some text.</p>';
      
      const selectedText = contentExtractor.extractSelectedText();
      expect(selectedText).toBeNull();
    });
  });

  describe('Content Cleaning', () => {
    it('should remove unwanted elements', () => {
      document.body.innerHTML = `
        <article>
          <h1>Test Article</h1>
          <p>Main content</p>
          <script>console.log('test');</script>
          <style>.test { color: red; }</style>
          <iframe src="test.html"></iframe>
        </article>
      `;

      const content = contentExtractor.extractMainContent();
      expect(content).toContain('Test Article');
      expect(content).toContain('Main content');
      expect(content).not.toContain('console.log');
      expect(content).not.toContain('.test');
      expect(content).not.toContain('iframe');
    });

    it('should handle special characters and formatting', () => {
      document.body.innerHTML = `
        <article>
          <p>Text with &nbsp; spaces and
            multiple lines</p>
          <p>Special characters: &amp; &lt; &gt;</p>
        </article>
      `;

      const content = contentExtractor.extractMainContent();
      expect(content).toContain('Text with spaces and multiple lines');
      expect(content).toContain('Special characters: & < >');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty pages gracefully', () => {
      document.body.innerHTML = '';
      
      const content = contentExtractor.extractMainContent();
      expect(content).toBe('');
    });

    it('should handle malformed HTML', () => {
      document.body.innerHTML = '<div>Unclosed div';
      
      const content = contentExtractor.extractMainContent();
      expect(content).toContain('Unclosed div');
    });

    it('should timeout on infinitely loading content', async () => {
      document.body.innerHTML = '<div id="loading">Loading...</div>';
      
      await expect(
        contentExtractor.extractMainContentWithRetry({ maxRetries: 3, retryDelay: 100 })
      ).rejects.toThrow('Content extraction timeout');
    });
  });

  describe('iframes and Shadow DOM', () => {
    it('should extract content from accessible iframes', () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentDocument!;
      iframeDoc.body.innerHTML = '<p>Iframe content</p>';

      const content = contentExtractor.extractMainContent({ includeIframes: true });
      expect(content).toContain('Iframe content');
    });

    it('should handle shadow DOM content', () => {
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<p>Shadow DOM content</p>';
      document.body.appendChild(host);

      const content = contentExtractor.extractMainContent({ includeShadowDOM: true });
      expect(content).toContain('Shadow DOM content');
    });
  });
}); 