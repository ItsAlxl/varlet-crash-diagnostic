import { askForLogs } from "../messenger"
import { BaseMessageCommand } from "./base"

export default new BaseMessageCommand(
	"ask_for_logs",
	async function(interaction) {
		return await askForLogs(interaction.targetMessage)
	},
)
