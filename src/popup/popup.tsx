import React from 'react';
import { createRoot } from 'react-dom/client';

const Popup: React.FC = () => {
    return (
        <div>
            <h1>Lirum Chrome LLMs</h1>
            <p>Select text on any webpage and use LLMs to analyze it.</p>
        </div>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<Popup />); 