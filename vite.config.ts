import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
	base: "/varlet-crash-diagnostic/",
	plugins: [
		tailwindcss()
	],
})