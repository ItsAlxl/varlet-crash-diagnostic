import { setElementTrKey } from "./localize"
import { displayLog } from "./output"

const selectFile = document.getElementById("select-log") as HTMLInputElement
const readSelectBtn = document.getElementById("parse-select-btn") as HTMLButtonElement

let logFile: File | undefined

function updateSelectedLog() {
	const files = selectFile.files
	if (files && files.length > 0) {
		applyLog(files[0])
	} else {
		setElementTrKey(readSelectBtn, "input_file_no_parse")
		readSelectBtn.disabled = true
	}
}

export function selectLog(log: File) {
	if (logFile != log) {
		const transfer = new DataTransfer()
		transfer.items.add(log)
		selectFile.files = transfer.files

		applyLog(log)
	}
}

function applyLog(log: File) {
	logFile = log
	readSelectBtn.disabled = false
	setElementTrKey(readSelectBtn, "input_file_parse")
	displayLog(logFile!)
}

selectFile.addEventListener("change", updateSelectedLog)
readSelectBtn.addEventListener("click", function () {
	if (logFile)
		displayLog(logFile)
})

updateSelectedLog()