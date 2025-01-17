import { ContentExtractor } from './ContentExtractor';

// Initialize content script
const initializeContentScript = () => {
    console.log('[Lirum] Content script loaded and initialized');

    // Listen for messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('[Lirum] Content script received message:', request);
        
        if (request.type === 'GET_PAGE_CONTENT') {
            try {
                // Check if we're in a valid context
                if (!document || !document.body) {
                    console.error('[Lirum] Invalid document context');
                    sendResponse({ error: 'Invalid document context' });
                    return true;
                }

                const result = ContentExtractor.extract();
                
                // Validate the result
                if (!result.content && !result.title) {
                    console.error('[Lirum] No content extracted');
                    sendResponse({ error: 'No content could be extracted from this page' });
                    return true;
                }

                console.log('[Lirum] Extracted content:', {
                    titleLength: result.title?.length || 0,
                    contentLength: result.content?.length || 0,
                    contentPreview: result.content?.slice(0, 100) || ''
                });

                sendResponse({
                    content: result.content || '',
                    title: result.title || document.title || ''
                });
            } catch (error) {
                console.error('[Lirum] Error extracting content:', error);
                sendResponse({ 
                    error: error instanceof Error ? error.message : 'Failed to extract content',
                    content: '',
                    title: document.title || ''
                });
            }
            return true; // Keep the message channel open for async response
        }
        return true; // Keep the message channel open for other messages
    });
};

// Initialize immediately if document is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initializeContentScript();
} else {
    // Otherwise wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initializeContentScript);
} 