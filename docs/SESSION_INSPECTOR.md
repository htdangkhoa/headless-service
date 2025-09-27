# Session Inspector

The Session Inspector is a powerful debugging feature that allows you to inspect and debug browser sessions running in the Headless Service. It provides access to Chrome DevTools Protocol (CDP) debugging capabilities through a web-based interface, enabling real-time inspection of pages, network activity, console logs, and more.

## Features

- **Real-time Page Inspection**: Inspect DOM elements, CSS styles, and page structure
- **Network Monitoring**: View network requests, responses, and timing
- **Console Access**: See console logs, errors, and warnings
- **Performance Profiling**: Analyze page performance and resource usage
- **JavaScript Debugging**: Set breakpoints and step through code

## Usage

See the [`HeadlessService.debuggerUrl`](#description/headlessservicedebuggerurl) documentation for more information.

## DevTools Frontend

The DevTools frontend provides a full Chrome DevTools experience including:

### Available Panels

1. **Elements**: Inspect and modify DOM structure and CSS styles
2. **Console**: View console logs, execute JavaScript, and debug code
3. **Sources**: Debug JavaScript with breakpoints and step-through debugging
4. **Network**: Monitor network requests, responses, and performance
5. **Performance**: Profile page performance and identify bottlenecks
6. **Memory**: Analyze memory usage and detect leaks
7. **Application**: Inspect storage, service workers, and manifest
8. **Security**: View security information and certificates
9. **Lighthouse**: Run performance and accessibility audits

### URL Structure

The DevTools frontend URL follows this pattern:
```
{{baseUrl}}/devtools/inspector.html?ws=<websocket-url>
```

![DevTools Frontend](images/devtools-frontend.png)