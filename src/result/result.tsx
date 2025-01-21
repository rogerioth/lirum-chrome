import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const Result: React.FC = () => {
    const [content, setContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadContent = async () => {
            try {
                // Get the result ID from URL parameters
                const urlParams = new URLSearchParams(window.location.search);
                const resultId = urlParams.get('id');
                
                if (!resultId) {
                    throw new Error('No result ID provided');
                }

                // Get content from storage
                const key = `lirum_${resultId}`;
                const result = await chrome.storage.local.get(key);
                
                if (!result[key]) {
                    throw new Error('Content not found. The result may have expired.');
                }

                setContent(result[key].content);

                // Clean up storage
                await chrome.storage.local.remove(key);
                
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load content');
            } finally {
                setLoading(false);
            }
        };

        loadContent();

        // Cleanup function to remove data if component unmounts
        return () => {
            const cleanup = async () => {
                const urlParams = new URLSearchParams(window.location.search);
                const resultId = urlParams.get('id');
                if (resultId) {
                    await chrome.storage.local.remove(`lirum_${resultId}`);
                }
            };
            cleanup();
        };
    }, []);

    if (loading) {
        return (
            <div className="loading">
                <p>Loading content...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="error">
                <h2>Error</h2>
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="result-content" dangerouslySetInnerHTML={{ __html: content }} />
    );
};

// Initialize the result page
const container = document.getElementById('content');
if (!container) {
    throw new Error('Content element not found');
}

const root = createRoot(container);
root.render(<Result />);
