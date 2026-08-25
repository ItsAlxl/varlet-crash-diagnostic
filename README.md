# Varlet Crash Diagnostic

Parse Darktide's console logs and diagnose crashes. There's a [live web app](https://itsalxl.github.io/varlet-crash-diagnostic) you can use right now.

## Building from Source

You can build and run the tool yourself from the source code; all you need is [NodeJS](https://nodejs.org/).

Execute the following commands within the project root to build the tool.

```sh
# Get dependencies (only needed once)
npm install

# Build the applications once
npm run build

# Build the applicatoins, and rebuild when changed
# Also provides the URL for the locally-hosted web app
npm run dev
```

The build's output is placed in `dist/` directories located throughout the project.

### Web App

You cannot simply open the html file due to an [intentional security mechanism](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) built into browsers. Instead, you will need to host the contents of the `apps/web/dist/` directory on a webserver. This can be done locally using Vite with either of the following commands from the `apps/web/` directory.

```sh
# Use Vite's local webserver
npm run preview

# Live development, as an alternative to repeatedly running 'build' and 'preview'
npm run dev
```

Vite will display the URL for your locally-hosted web app.

Deploying the web app to a production environment only requires serving the contents of the `apps/web/dist/` directory, which are static.

## Localization

Localizations are found in the `packages/localize/src/localization.json` file. Each locale *must* have a `locale_name` key, the value of which is the native name of the language. Otherwise, if a key is not present in a specific locale, its `en` value is used as a fallback.

Two forms of interpolation are supported:

1. `"This is a {{variable}} value."` - `{{variable}}` is replaced by a contextual variable named `variable`.
2. `"This is a {{'literal string'}} value."` - `{{'literal string'}}` is replaced by the text `literal string`. While this form of interpolation isn't useful on its own, it helps to declutter the translations file when the interpolated value has other attributes (see below).

Interpolations can have attributes after the translation key, which are only relevant when the result is sent to the DOM (and not just plaintext). Currently only one attribute is supported:

- `link=<link_key>` makes the interpolated text a link. `link_key` is not arbitrary; the list of supported links can be found in `packages/localize/src/localize.ts`

For example, `"{{'This text' link=repo}} is a link to the source code."`

If the translation key is a link, that will be replaced with the full URL of the link. For example, `"This is my website: {{link=alxl}}"` will display `This is my website: https://itsalxl.com`
