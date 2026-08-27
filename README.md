# Varlet Crash Diagnostic

Parse Darktide's console logs and diagnose crashes. There's a [live web app](https://itsalxl.github.io/varlet-crash-diagnostic) you can use right now.

## Building from Source

You can build and run the tools yourself from the source code; all you need is [NodeJS](https://nodejs.org/).

Execute the following commands within the project root to build the tools.

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

The bot parses logs and crash text when pinged. Ping it in a message with logs attached and it will respond with a readout of insights and an attached report. You can also get the bot to respond to an already-sent message by editing the message text to ping the bot.

Alternatively, you can ping the bot in a reply to a message that has logs attached, and the bot will respond to the original message. However, the content of messages that do not ping the bot is [considered privileged](https://support-dev.discord.com/hc/en-us/articles/6205754771351-How-do-I-get-Privileged-Intents-for-my-bot), so this is an optional feature that has to be enabled with the environment variable `PRIVILEGED_MESSAGE_CONTENT=true`

Running the bot requires providing a valid Discord bot auth token, which you can get from the [Discord developer portal](https://discord.com/developers/applications). Supply it with the environment variable `DISCORD_TOKEN=your-token-here`

Both `npm run dev` and `npm run bot` read environment variables from a file named `.env` in the `apps/discord/` directory. Alternatively, you can set the environment variables normally and run the bot with `node apps/discord/dist/bot.js`

## Localization

Localizations are found in the `packages/localize/src/localization.json` file. Each locale *must* have a `locale_name` key, the value of which is the native name of the language. Otherwise, if a key is not present in a specific locale, its `en` value is used as a fallback.

Two forms of interpolation are supported:

1. `"This is a {{variable}} value."` - `{{variable}}` is replaced by a contextual variable named `variable`.
2. `"This is a {{'literal string'}} value."` - `{{'literal string'}}` is replaced by the text `literal string`. While this form of interpolation isn't useful on its own, it helps to declutter the translations file when the interpolated value has other attributes (see below).

Interpolations can have attributes after the translation key, which are only relevant when the result is sent to the DOM or sent as Markdown (and not just plaintext). Currently two attributes are supported:

- `code` uses a monospace font.
- `link=<link_key>` makes the interpolated text a link. `link_key` is not arbitrary; the list of supported links can be found in `packages/localize/src/localize.ts`

For example, `"{{'This text' link=repo}} is a link to the source code."`

If the translation key is a link, that will be replaced with the full URL of the link. For example, `"This is my website: {{link=alxl}}"` will display `This is my website: https://itsalxl.com`
