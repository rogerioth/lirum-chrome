# Lirum Chrome LLMs

<div align="center">
  <img src="src/assets/icon128.png" alt="Lirum Chrome LLMs Logo" width="128"/>
  <p>A powerful Chrome extension for seamless integration of Large Language Models into your browsing experience.</p>
</div>

## Table of Contents
- [Overview](#overview)
- [Features](#features)
  - [Secure API Management](#secure-api-management)
  - [Multi-Provider Support](#multi-provider-support)
  - [Smart Commands](#smart-commands)
  - [Easy Integration](#easy-integration)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development Setup](#development-setup)
- [Architecture](#architecture)
  - [Core Components](#core-components)
  - [Technology Stack](#technology-stack)
  - [Security](#security)
- [Usage](#usage)
  - [Basic Usage](#basic-usage)
  - [Configuration](#configuration)
  - [Custom Commands](#custom-commands)
- [Development](#development)
  - [Scripts](#scripts)
  - [Building](#building)
  - [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Overview

Lirum Chrome LLMs is a sophisticated Chrome extension that brings the power of various Large Language Models (LLMs) directly to your browser. With support for multiple providers like OpenAI, Anthropic, Deepseek, and more, users can instantly analyze, summarize, or transform web content using state-of-the-art AI models.

## Features

### Secure API Management
- Encrypted storage of API credentials
- Support for multiple provider configurations
- Secure key management following Chrome extension best practices

### Multi-Provider Support
Out-of-the-box integration with leading LLM providers:
- OpenAI (GPT-3.5, GPT-4)
- Anthropic (Claude)
- Deepseek
- Ollama
- LM Studio
- More providers coming soon!

### Smart Commands
- Pre-configured commands for common tasks:
  - Summarize
  - Paraphrase
  - Create Bullet Points
  - Translate
  - Analyze Tone
- Custom command support
- Command history and favorites

### Easy Integration
- One-click activation from any webpage
- Automatic content extraction
- Support for text selection
- Markdown rendering for beautiful outputs
- Collapsible interface for better workspace management

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Google Chrome browser

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/rogerioth/lirum-chrome.git
   cd lirum-chrome
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` directory

### Development Setup
1. Set up your development environment:
   ```bash
   npm run setup
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## Architecture

### Core Components
- **Popup Interface**: React-based UI for user interactions
- **Background Service**: Handles API communications and state management
- **Content Scripts**: Manages webpage integration and content extraction
- **Options Page**: Configuration interface for providers and settings

### Technology Stack
- **Frontend**: React, TypeScript, CSS Modules
- **Build System**: Webpack, Babel
- **State Management**: React Context
- **Testing**: Jest, React Testing Library
- **Security**: DOMPurify, Secure Storage APIs

### Security
- Encrypted storage for API keys
- XSS prevention through content sanitization
- Secure communication channels
- Regular security audits

## Usage

### Basic Usage
1. Click the Lirum icon in your Chrome toolbar
2. Select an LLM provider and command
3. Review the extracted content
4. Click "Send" or press Enter
5. View the AI-generated response in beautiful markdown

### Configuration
1. Access the options page through extension settings
2. Add your API keys for desired providers
3. Configure default providers and commands
4. Customize appearance and behavior settings

### Custom Commands
1. Open the extension options
2. Navigate to "Commands"
3. Click "Add New Command"
4. Configure command name and template
5. Save and use from the popup interface

## Development

### Scripts
- `scripts/windows/run.bat`: Start development environment (Windows)
- `scripts/windows/test.bat`: Run test suite (Windows)
- `scripts/windows/deploy.bat`: Build for production (Windows)
- Similar scripts available for Linux/macOS

### Building
```bash
# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run type-check
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint
```

## Contributing
We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to submit pull requests, report issues, and contribute to development.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <p>Made with ❤️ by Lirum Labs Technologies</p>
</div>
