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

The bot parses console log files and crash popup text. You can get a response from it in several ways:

1. Send a message that pings the bot containing the crash info
2. Edit a message containing the crash info to ping the bot
3. Reply to a message containing crash info and ping the bot in the reply (see `REPLY_RETARGETING` below)
4. Send a message containing crash popup text, regardless of it pings the bot (see `AUTO_ASK_FOR_LOGS` below)
5. DM the bot with the crash info

The bot consumes several environment variables for configuration. Both `npm run dev` and `npm run bot` read environment variables from a file named `.env` in the `apps/discord/` directory. Alternatively, you can set the environment variables normally and run the bot with `node apps/discord/dist/bot.js`

#### DISCORD_TOKEN

The bot requires a valid Discord bot auth token, which you can get from the [Discord developer portal](https://discord.com/developers/applications). Supply it with the environment variable `DISCORD_TOKEN=your-token-here`

#### REPLY_RETARGETING

The content of messages that do not ping the bot is [considered privileged](https://support-dev.discord.com/hc/en-us/articles/6205754771351-How-do-I-get-Privileged-Intents-for-my-bot), so using a reply to direct the bot to a message that didn't ping it is only enabled with the environment variable `REPLY_RETARGETING=true`

#### AUTO_ASK_FOR_LOGS

If you want the bot to automatically respond without being pinged to any message that contains crash popup text or crash dumps without any accompanying console logs, you can set the environment variable `AUTO_ASK_FOR_LOGS=true`; note that this requires privileged message content permission like `REPLY_RETARGETING`.

#### REACT_EMOJI

If explicitly invoked to respond to a message that does not contain any crash info, the bot will instead react with an emoji so that you know it's still active and responding. By default, the bot reacts with `:eyes:`, though this can be changed with the environment variable `REACT_EMOJI=emoji-id`. Consult the [discord.js docs fregarding valid emoji input](https://discordjs.guide/legacy/popular-topics/reactions) for information on how to supply other emojis.

To disable the reaction behavior, simply revoke the bot's reaction permission in your Discord server.

#### DISCORD_APP_ID

The bot has several commands that can be accessed by right-clicking a message in Discord and navigating to the `Apps` submenu. By default, these are available to all users that have permission to send messages. They are only enabled if you provide your Discord application ID, which you can get from the [Discord developer portal](https://discord.com/developers/applications). Supply it with the environment variable `DISCORD_APP_ID=your-id-here`

#### PREFERRED_CHANNEL

If you want to encourage users to ping the bot in a specific channel, provide the environment variable `PREFERRED_CHANNEL=channel-url-here` and the bot will tell users to ping it in that channel when it responds to messages in other channels.

#### DEDUPE_HISTORY

In order to prevent the bot from generating responses to the same info in a short timeframe, the bot remembers a certain number of GUIDs and will not respond to a new message if its GUID is already present in that history. Two separate histories are tracked for crash popup text and console logs. Note that the history is universal, not guild-dependent; this is done to keep the bot simple, as it doesn't really have a use-case for per-guild histories. The default history length is 10, but can be changed with the envrionment variable `DEDUPE_HISTORY`

## Localization

Localizations are found in the `packages/localize/src/localization.json` file. Each locale *must* have a `locale_name` key, the value of which is the native name of the language. Otherwise, if a key is not present in a specific locale, its `en` value is used as a fallback. Note that the `bot_cmd_*_title` values must be 32 characters or less; this is a limitation from Discord.

Two forms of interpolation are supported:

1. `"This is a {{variable}} value."` - `{{variable}}` is replaced by a contextual variable named `variable`.
2. `"This is a {{%_ref}} value."` - `{{%_ref}}` is replaced by translating the key `_ref` with the same context and attributes (see below). This form of interpolation is only for the localizer's convenience to reduce duplicate text; keys that start with `_` are never used by the applications directly, so they do not need to be localized if you do not use them with this form of interpolation.
3. `"This is a {{'literal string'}} value."` - `{{'literal string'}}` is replaced by the text `literal string`. While this form of interpolation isn't useful on its own, it helps to declutter the translations file when the interpolated value has other attributes (see below).

Interpolations can have attributes after the translation key, which are only relevant when the result is sent to the DOM or sent as Markdown (and not just plaintext). Currently two attributes are supported:

- `code` uses a monospace font.
- `link=<link_key>` makes the interpolated text a link. `link_key` is not arbitrary; the list of supported links can be found in `packages/localize/src/localize.ts`

For example, `"{{'This text' link=repo}} is a link to the source code."`

If the translation key is a link, that will be replaced with the full URL of the link. For example, `"This is my website: {{link=alxl}}"` will display `This is my website: https://itsalxl.com`
