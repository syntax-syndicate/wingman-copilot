import { OllamaSettingsType } from "@shared/types/Settings";
import { InitSettings } from "./App";

type OllamaSection = InitSettings["providerSettings"]["Ollama"] & {
	ollamaModels: string[];
	onChange: (ollamaSettings: OllamaSettingsType) => void;
};
export const OllamaSettingsView = ({
	codeModel,
	chatModel,
	ollamaModels,
	apiPath,
	modelInfoPath,
	baseUrl,
	onChange,
}: OllamaSection) => {
	const paths = { codeModel, chatModel, baseUrl, apiPath, modelInfoPath };
	const handleChange = (e: any) => {
		if (!ollamaModels.includes(e.target.value)) return;
		const clone = { ...paths };
		clone["codeModel"] = e.target.value;
		onChange(clone);
	};

	const handleChatChange = (e: any) => {
		if (!ollamaModels.includes(e.target.value)) return;
		const clone = { ...paths };
		clone["chatModel"] = e.target.value;
		onChange(clone);
	};

	const handleChangeInput = (e: any) => {
		const field = e.target.getAttribute("data-name");
		const clone = { ...paths };
		//@ts-ignore
		clone[field] = e.target.value;
		onChange(clone);
	};

	return (
		<div className="flex flex-col space-y-4">
			<div className="flex flex-col">
				<label
					htmlFor="code-model"
					className="mb-1 text-sm font-medium text-[var(--vscode-foreground)]"
				>
					Code model:
				</label>
				<select
					id="code-model"
					value={codeModel}
					onChange={handleChange}
					className="w-full px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
				>
					{ollamaModels.map((model) => (
						<option key={model} value={model}>
							{model}
						</option>
					))}
				</select>
			</div>

			<div className="flex flex-col">
				<label
					htmlFor="chat-model"
					className="mb-1 text-sm font-medium text-[var(--vscode-foreground)]"
				>
					Chat model:
				</label>
				<select
					id="chat-model"
					value={chatModel}
					onChange={handleChatChange}
					className="w-full px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
				>
					{ollamaModels.map((model) => (
						<option key={model} value={model}>
							{model}
						</option>
					))}
				</select>
			</div>

			<div className="flex flex-col">
				<label
					htmlFor="base-url"
					className="mb-1 text-sm font-medium text-[var(--vscode-foreground)]"
				>
					Base url:
				</label>
				<input
					id="base-url"
					type="text"
					onChange={handleChangeInput}
					value={baseUrl}
					data-name="baseUrl"
					title="Ollama's base path"
					className="px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
				/>
			</div>

			<div className="flex flex-col">
				<label
					htmlFor="api-path"
					className="mb-1 text-sm font-medium text-[var(--vscode-foreground)]"
				>
					Api path:
				</label>
				<input
					id="api-path"
					type="text"
					onChange={handleChangeInput}
					value={apiPath}
					data-name="apiPath"
					title="Ollama's generation endpoint"
					className="px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
				/>
			</div>

			<div className="flex flex-col">
				<label
					htmlFor="model-info-path"
					className="mb-1 text-sm font-medium text-[var(--vscode-foreground)]"
				>
					Model info path:
				</label>
				<input
					id="model-info-path"
					type="text"
					onChange={handleChangeInput}
					value={modelInfoPath}
					data-name="modelInfoPath"
					title="Ollama's info path"
					className="px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
				/>
			</div>
		</div>
	);
};