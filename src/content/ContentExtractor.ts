export interface ExtractedContent {
    title: string;
    content: string;
}

export class ContentExtractor {
    static extract(): { content: string; title: string } {
        const title = document.title;
        
        // Create a non-attached clone of the body to work with
        const tempBody = document.body.cloneNode(true) as HTMLElement;
        
        // Remove unwanted elements from the clone
        const unwantedSelectors = [
            'script',
            'style',
            'noscript',
            'iframe',
            'svg',
            'canvas'
        ];
        
        unwantedSelectors.forEach(selector => {
            tempBody.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Get main content area if it exists
        let mainContent = '';
        const mainElement = tempBody.querySelector('main, article, #main, #content, .main, .content');
        if (mainElement) {
            mainContent = this.cleanText(mainElement.textContent || '');
        }

        // If no main content found or it's too short, use the whole body
        if (!mainContent || mainContent.length < 100) {
            mainContent = this.cleanText(tempBody.textContent || '');
        }

        // Validate content length
        if (mainContent.length < 10) {
            throw new Error('Page content is too short or empty');
        }

        return {
            content: mainContent,
            title
        };
    }

    private static cleanText(text: string): string {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n')
            .replace(/\s+/g, ' ')
            .trim();
    }
}