import { displayLog } from "./output"

const selectFile = document.getElementById("select-log") as HTMLInputElement
const readSelectBtn = document.getElementById("parse-select-btn") as HTMLButtonElement

let logFile: File | undefined

function updateSelectedLog() {
	const files = selectFile.files
	if (files && files.length > 0) {
		logFile = files[0]
		readSelectBtn.disabled = false
		readSelectBtn.innerText = "Parse selected log"
		displayLog(logFile)
	} else {
		readSelectBtn.innerText = "No log selected"
		readSelectBtn.disabled = true
	}
}

selectFile.addEventListener("change", updateSelectedLog)
readSelectBtn.addEventListener("click", function () {
	if (logFile)
		displayLog(logFile)
})

updateSelectedLog()