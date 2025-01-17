# easify

A TypeScript-based utility library providing commonly used APIs and integrations with a focus on maintainability and ease of use.

## Features

- 🪵 **Logging Utility** - Simple yet powerful logging with Bunyan
- 📝 **TypeScript Support** - Full type definitions included
- 🛠️ **Code Quality Tools** - Built-in ESLint and Prettier configuration
- 🧪 **Testing Framework** - Jest integration with coverage reporting

## Installation

```bash
npm install easify
```

## Quick Start

### Logging Example
```typescript
import { LogHelper } from 'easify';

const logger = new LogHelper('MyService');
logger.info('Application started');
logger.error('Something went wrong', new Error('Oops!'), { userId: '123' });
```

## Requirements

- Node.js >= 20.x
- TypeScript >= 5.x

## Documentation

### LogHelper

The `LogHelper` class provides a standardized logging interface with multiple log levels and structured logging support.

```typescript
const logger = new LogHelper('ServiceName');

// Basic logging
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// Logging with metadata
logger.info('Operation completed', { operationId: '123' });

// Logging with error objects
logger.error('Operation failed', new Error('Database connection failed'), { operationId: '123' });

// Creating child loggers with context
const childLogger = logger.child({ requestId: 'abc-123' });
childLogger.info('Processing request');
```

## Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests:
   ```bash
   npm test
   ```
4. Build the project:
   ```bash
   npm run build
   ```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- Open an issue for bug reports or feature requests
- Submit pull requests for contributions
- Check our documentation for more information

## Roadmap

- Additional utility modules
- Common API integrations
- More helper classes and functions

---

Built with ❤️ for developers who value simplicity and maintainability.