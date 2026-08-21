# Varlet Crash Diagnostic

A web app for diagnosing Darktide crashes and parsing its console logs.

## Building from Source

You can build and run the tool yourself from the source code; all you need is [NodeJS](https://nodejs.org/).

Execute the following commands within the project root to build the tool.

```sh
# Get dependencies (only needed once)
npm install

# Build the application (repeat after changes to the source)
npm run build
```

The build's output is placed in a `dist/` directory within the project root. You cannot simply open the html file, however, due to an [intentional security mechanism](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) built into browsers. Instead, you will need to host the contents of the `dist/` directory on a webserver. This can be done locally using Vite with either of the following commands.

```sh
# Use Vite's local webserver
npm run preview

# Alternatively, instead of executing 'build' and 'preview' repeatedly, you can use Vite's live development option for easier iteration while making changes
npm run dev
```

Vite will tell you the URL to connect to.

Deploying to a production environment only requires serving the contents of the `dist/` directory, which are static.
