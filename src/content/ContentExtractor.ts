interface ContentExtractionOptions {
  includeIframes?: boolean;
  includeShadowDOM?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export class ContentExtractor {
  private readonly defaultOptions: ContentExtractionOptions = {
    includeIframes: false,
    includeShadowDOM: false,
    maxRetries: 3,
    retryDelay: 1000
  };

  constructor() {}

  extractMainContent(options: ContentExtractionOptions = {}): string {
    const opts = { ...this.defaultOptions, ...options };
    const content: string[] = [];

    // Extract from main document
    content.push(this.extractFromElement(document.body));

    // Extract from iframes if enabled
    if (opts.includeIframes) {
      const iframes = Array.from(document.getElementsByTagName('iframe'));
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument;
          if (iframeDoc) {
            content.push(this.extractFromElement(iframeDoc.body));
          }
        } catch (e) {
          // Skip inaccessible iframes
        }
      }
    }

    // Extract from Shadow DOM if enabled
    if (opts.includeShadowDOM) {
      const shadowHosts = document.querySelectorAll('*');
      shadowHosts.forEach(host => {
        const shadow = host.shadowRoot;
        if (shadow) {
          content.push(this.extractFromElement(shadow));
        }
      });
    }

    return this.cleanContent(content.join('\n'));
  }

  private extractFromElement(element: Element | ShadowRoot): string {
    // Clone the element to avoid modifying the original
    const clone = element instanceof ShadowRoot ? element : element.cloneNode(true) as Element;

    // Remove unwanted elements
    const unwanted = ['script', 'style', 'noscript', 'iframe', 'nav', 'footer'];
    unwanted.forEach(tag => {
      const elements = clone instanceof ShadowRoot ? 
        clone.querySelectorAll(tag) : 
        (clone as Element).querySelectorAll(tag);
      elements.forEach(el => el.remove());
    });

    // Get text content
    return clone instanceof ShadowRoot ? 
      clone.textContent || '' : 
      (clone as Element).textContent || '';
  }

  private cleanContent(content: string): string {
    return content
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .replace(/\n\s*/g, '\n')  // Clean up newlines
      .trim();
  }

  async extractMainContentWithRetry(options: ContentExtractionOptions = {}): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };
    let content = '';
    let attempts = 0;

    while (attempts < opts.maxRetries!) {
      content = this.extractMainContent(opts);
      if (content.trim()) {
        return content;
      }

      await new Promise(resolve => setTimeout(resolve, opts.retryDelay));
      attempts++;
    }

    throw new Error('Content extraction timeout');
  }

  extractSelectedText(): string | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    return this.cleanContent(container.textContent || '');
  }
} 