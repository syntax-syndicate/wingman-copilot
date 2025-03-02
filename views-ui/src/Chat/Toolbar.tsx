import { VscClearAll } from "react-icons/vsc";
import { HiDatabase } from "react-icons/hi";
import { HiChatAlt } from "react-icons/hi";
import { HiLightningBolt } from "react-icons/hi";
import { vscode } from "./utilities/vscode";
import { useSettingsContext } from "./context/settingsContext";
import { useChatContext } from "./context/chatContext";
import { useComposerContext } from "./context/composerContext";
import { MdSettings } from "react-icons/md";

const viewName = {
	chat: "Chat",
	composer: "Compose",
	index: "Index",
};

export default function Toolbar() {
	const {
		isLightTheme,
		view,
		setView,
	} = useSettingsContext();
	const { clearMessages } = useChatContext();
	const { setComposerMessages } = useComposerContext();

	const buttonBaseClasses = "rounded transition-colors duration-300 p-2";
	const buttonActiveClasses = isLightTheme
		? "bg-gray-300 text-black"
		: "bg-gray-700 text-white";
	const buttonInactiveClasses = isLightTheme
		? "text-black hover:bg-gray-200"
		: "text-white hover:bg-gray-800";

	return (
		<div className="flex justify-between items-center gap-4">
			<h2 className="text-lg font-bold flex-auto">{viewName[view]}</h2>
			<button
				className={`${buttonBaseClasses} ${view === "chat"
						? buttonActiveClasses
						: buttonInactiveClasses
					}`}
				onClick={() => setView("chat")}
				title="Chat"
			>
				<HiChatAlt size={24} />
			</button>
			<button
				className={`${buttonBaseClasses} ${view === "composer"
						? buttonActiveClasses
						: buttonInactiveClasses
					}`}
				onClick={() => setView("composer")}
				title="Composer"
			>
				<HiLightningBolt size={24} />
			</button>
			<button
				className={`${buttonBaseClasses} ${view === "index"
						? buttonActiveClasses
						: buttonInactiveClasses
					}`}
				onClick={() => setView("index")}
				title="Index"
			>
				<HiDatabase size={24} />
			</button>
			<button
				className={`${buttonBaseClasses} ${buttonInactiveClasses}`}
				onClick={() => {
					vscode.postMessage({ command: 'openSettings' })
				}}
				title="Settings"
			>
				<MdSettings size={24} />
			</button>
			<button
				className={`${buttonBaseClasses} ${buttonInactiveClasses}`}
				onClick={() => {
					vscode.postMessage({
						command: "clear-chat-history",
					});
					clearMessages();
					setComposerMessages([]);
				}}
				title="Clear chat history"
			>
				<VscClearAll size={24} role="presentation" />
			</button>
		</div>
	);
}
