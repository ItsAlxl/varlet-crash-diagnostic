import { setElementTrKey } from "./localize"
import { displayLog } from "./output"

const selectFile = document.getElementById("select-log") as HTMLInputElement
const readSelectBtn = document.getElementById("parse-select-btn") as HTMLButtonElement

let logFile: File | undefined

function updateSelectedLog() {
	const files = selectFile.files
	if (files && files.length > 0) {
		logFile = files[0]
		readSelectBtn.disabled = false
		setElementTrKey(readSelectBtn, "input_file_parse")
		displayLog(logFile)
	} else {
		setElementTrKey(readSelectBtn, "input_file_no_parse")
		readSelectBtn.disabled = true
	}
}

selectFile.addEventListener("change", updateSelectedLog)
readSelectBtn.addEventListener("click", function () {
	if (logFile)
		displayLog(logFile)
})

updateSelectedLog()