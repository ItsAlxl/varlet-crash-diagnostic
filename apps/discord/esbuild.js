import * as esbuild from 'esbuild'

const isDev = process && process.argv && process.argv.includes("--dev")
const config = {
	entryPoints: ["src/bot.ts"],
	outfile: "dist/bot.js",
	bundle: true,
	minify: !isDev,
	platform: "node",
}

if (isDev) {
	(await esbuild.context(config)).watch()
} else {
	await esbuild.build(config)
}
