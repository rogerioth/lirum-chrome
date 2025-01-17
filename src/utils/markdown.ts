import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked options
marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Convert \n to <br>
});

// Custom renderer to add classes and styling
const renderer = new marked.Renderer();

// Style tables
renderer.table = (header: string, body: string) => {
    return `<table class="md-table">\n<thead>\n${header}</thead>\n<tbody>\n${body}</tbody>\n</table>\n`;
};

// Style code blocks
renderer.code = (code: string, language: string | undefined) => {
    return `<pre class="md-pre"><code class="md-code ${language ? `language-${language}` : ''}">${code}</code></pre>`;
};

// Style blockquotes
renderer.blockquote = (quote: string) => {
    return `<blockquote class="md-blockquote">${quote}</blockquote>`;
};

marked.use({ renderer });

/**
 * Converts markdown to sanitized HTML with custom styling
 */
export const markdownToHtml = (markdown: string): string => {
    // Convert markdown to HTML
    const rawHtml = marked.parse(markdown) as string;
    
    // Sanitize HTML to prevent XSS
    const cleanHtml = DOMPurify.sanitize(rawHtml);

    // Add classes to elements
    const div = document.createElement('div');
    div.innerHTML = cleanHtml;

    div.querySelectorAll('p').forEach(el => el.classList.add('md-paragraph'));
    div.querySelectorAll('h1').forEach(el => el.classList.add('md-h1'));
    div.querySelectorAll('h2').forEach(el => el.classList.add('md-h2'));
    div.querySelectorAll('h3').forEach(el => el.classList.add('md-h3'));
    div.querySelectorAll('h4').forEach(el => el.classList.add('md-h4'));
    div.querySelectorAll('ul').forEach(el => el.classList.add('md-ul'));
    div.querySelectorAll('ol').forEach(el => el.classList.add('md-ol'));
    div.querySelectorAll('li').forEach(el => el.classList.add('md-li'));
    div.querySelectorAll('a').forEach(el => {
        el.classList.add('md-link');
        el.setAttribute('target', '_blank');
    });
    div.querySelectorAll('em').forEach(el => el.classList.add('md-em'));
    div.querySelectorAll('strong').forEach(el => el.classList.add('md-strong'));
    div.querySelectorAll('hr').forEach(el => el.classList.add('md-hr'));

    return div.innerHTML;
};
