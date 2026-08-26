# Varlet Crash Diagnostic

Parse Darktide's console logs and diagnose crashes. There's a [live web app](https://itsalxl.github.io/varlet-crash-diagnostic) you can use right now.

## Building from Source

You can build and run the tool yourself from the source code; all you need is [NodeJS](https://nodejs.org/).

Execute the following commands within the project root to build the tool.

```sh
# Get dependencies (only needed once, but may take a while!)
npm install

# Build the applications once
npm run build

# Build the applications, and rebuild when changed
# Also provides the URL for the locally-hosted web app
npm run dev
```

The build's output is placed in `dist/` directories located throughout the project. If you want to focus on just one app, you can run `npm run build` and `npm run dev` from their respective subdirectories.

### Web App

You cannot simply open the html file due to an [intentional security mechanism](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) built into browsers. Instead, you will need to host the contents of the `apps/web/dist/` directory on a webserver. This can be done locally using Vite (which is installed as a dependency) by executing either of the following commands from the `apps/web/` directory.

```sh
# Use Vite's local webserver
npm run preview

# Live development, as an alternative to repeatedly running 'build' and 'preview'
npm run dev
```

Vite will display the URL for your locally-hosted web app.

Deploying the web app to a production environment only requires serving the contents of the `apps/web/dist/` directory, which are static.

### Discord Bot

The bot parses logs and crash text when pinged. You can ask it to read logs by either pinging it in the message that has the logs attached or by pinging it in a reply to a message with logs. Note that the content of messages that do not ping the bot is [considered privleged](https://docs.discord.com/developers/gateway/you-might-not-need-a-privileged-intent#message-content-intent), so the reply method may only work if the original message pinged (or is edited to ping) the bot.

Running the bot requires providing a valid Discord bot auth token, which you can get from the [Discord developer portal](https://discord.com/developers/applications). Both `npm run dev` and `npm run bot` expect the token to be supplied as `DISCORD_TOKEN=your-token-here` in a file named `.env` in the `apps/discord/` directory. Alternatively, you can set the `DISCORD_TOKEN` environment variable and run the bot with `node apps/discord/dist/bot.js`

## Localization

Localizations are found in the `packages/localize/src/localization.json` file. Each locale *must* have a `locale_name` key, the value of which is the native name of the language. Otherwise, if a key is not present in a specific locale, its `en` value is used as a fallback.

Two forms of interpolation are supported:

1. `"This is a {{variable}} value."` - `{{variable}}` is replaced by a contextual variable named `variable`.
2. `"This is a {{'literal string'}} value."` - `{{'literal string'}}` is replaced by the text `literal string`. While this form of interpolation isn't useful on its own, it helps to declutter the translations file when the interpolated value has other attributes (see below).

Interpolations can have attributes after the translation key, which are only relevant when the result is sent to the DOM (and not just plaintext). Currently two attributes are supported:

- `code` uses a monospace font.
- `link=<link_key>` makes the interpolated text a link. `link_key` is not arbitrary; the list of supported links can be found in `packages/localize/src/localize.ts`

For example, `"{{'This text' link=repo}} is a link to the source code."`

If the translation key is a link, that will be replaced with the full URL of the link. For example, `"This is my website: {{link=alxl}}"` will display `This is my website: https://itsalxl.com`
