# Common Utils Library

A TypeScript-based utility library providing commonly used APIs and integrations with a focus on maintainability and ease of use.

## Overview

This library serves as a foundation for common utilities and integrations that can be shared across multiple projects. It is built with TypeScript to ensure type safety and better developer experience.

## Features

### Current
- Logging utility (LogHelper) - A wrapper around Bunyan logger
- TypeScript support with type definitions
- Built-in ESLint and Prettier configuration
- Jest testing framework integration

### Planned
- Additional utility modules (TBD)
- Common API integrations (TBD)
- More helper classes and functions (TBD)

## Project Structure
common-utils/
├── src/
│ ├── logging/
│ │ ├── LogHelper.ts
│ │ └── index.ts
│ └── index.ts
├── tests/
│ └── logging/
│ └── LogHelper.test.ts
├── dist/
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
└── README.md

## Technical Specifications

### Development Environment
- Node.js (>= 16.x)
- TypeScript (>= 4.x)
- npm or yarn for package management

### Build System
- TypeScript compiler for transpilation
- Rollup for bundling (if needed)
- Generation of type definitions (.d.ts files)

### Testing
- Jest for unit testing
- Coverage reporting
- Integration tests for external dependencies

### Code Quality
- ESLint for code linting
- Prettier for code formatting
- Husky for pre-commit hooks

## LogHelper Specification

### Purpose
The LogHelper class provides a standardized logging interface that currently uses Bunyan internally but can be easily switched to a different logging library if needed.

### Features
- Multiple log levels (DEBUG, INFO, WARN, ERROR)
- Structured logging
- Context/correlation ID support
- Optional metadata support
- Type-safe logging methods

### Usage Example
```typescript
const logger = new LogHelper('ServiceName');
logger.info('Operation completed', { operationId: '123' });
logger.error('Operation failed', error, { operationId: '123' });
```
### Interface
```typescript
interface ILogHelper {
debug(message: string, ...args: any[]): void;
info(message: string, ...args: any[]): void;
warn(message: string, ...args: any[]): void;
error(message: string, error?: Error, ...args: any[]): void;
child(options: object): ILogHelper;
}
```

## Installation & Usage

### Installation
```bash
npm install @your-org/common-utils
```

### Basic Usage
```typescript
import { LogHelper } from '@your-org/common-utils';

const logger = new LogHelper('MyService');
logger.info('Application started');
```

## Development Guidelines

### Adding New Features
1. Create a new directory under `src/` for the feature
2. Implement the feature with TypeScript
3. Add corresponding test files
4. Update documentation
5. Submit PR for review

### Testing Requirements
- Unit tests for all public methods
- Integration tests for external dependencies
- Minimum 80% code coverage

### Documentation Requirements
- TSDoc comments for all public APIs
- README updates for new features
- Example usage in documentation

## Release Process

### Version Control
- Semantic versioning (MAJOR.MINOR.PATCH)
- Changelog updates for each release
- Git tags for releases

### Publishing
1. Update version in package.json
2. Build and test
3. Generate documentation
4. Publish to npm registry
5. Create GitHub release

## Contribution Guidelines

### Pull Requests
- Feature branch workflow
- PR template usage
- Code review requirements
- CI checks must pass

### Code Style
- Follow TypeScript best practices
- Use provided ESLint and Prettier configurations
- Maintain consistent file structure

## License
MIT License

## Support
- GitHub Issues for bug reports and feature requests
- Pull Requests welcome
- Regular maintenance and updates





