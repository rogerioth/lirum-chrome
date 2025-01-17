// Background service worker
console.log('Background service worker initialized'); 

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'fetch') {
        console.log('Fetch request received:', message);
        
        fetch(message.url, message.options)
            .then(async response => {
                console.log('Fetch response received:', {
                    status: response.status,
                    statusText: response.statusText
                });
                
                // Convert the response to a serializable object
                const responseBody = await response.text();
                const headers: Record<string, string> = {};
                response.headers.forEach((value, key) => {
                    headers[key] = value;
                });
                sendResponse({
                    body: responseBody,
                    status: response.status,
                    statusText: response.statusText,
                    headers
                });
            })
            .catch(error => {
                console.error('Fetch error:', error);
                sendResponse({
                    error: error.message,
                    details: {
                        name: error.name,
                        stack: error.stack
                    }
                });
            });
        return true; // Required to use sendResponse asynchronously
    }
}); 