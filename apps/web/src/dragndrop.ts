import { selectLog } from "./input_log"

const dropzoneLogfile = document.getElementById("dropzone-logfile") as HTMLDivElement

window.addEventListener("drop", (e) => {
	if (e.dataTransfer && [...e.dataTransfer.items].some((item) => item.kind === "file")) {
		e.preventDefault()
	}
})

dropzoneLogfile.addEventListener("dragover", (e) => {
	if (e.dataTransfer) {
		const fileItems = [...e.dataTransfer.items].filter(
			(item) => item.kind === "file",
		)

		if (fileItems.length > 0) {
			e.preventDefault()
			e.dataTransfer.dropEffect = "copy"
		}
	}
})

window.addEventListener("dragover", (e) => {
	if (e.dataTransfer) {
		const fileItems = [...e.dataTransfer.items].filter(
			(item) => item.kind === "file",
		)
		if (fileItems.length > 0) {
			e.preventDefault()
			if (!dropzoneLogfile.contains(e.target as Node)) {
				e.dataTransfer.dropEffect = "none"
			}
		}
	}
})

dropzoneLogfile.addEventListener("drop", (e) => {
	if (e.dataTransfer) {
		e.preventDefault()
		const log = [...e.dataTransfer.items]
			.map((item) => item.getAsFile())
			.find((file) => file !== null)
		if (log)
			selectLog(log)
	}
})
