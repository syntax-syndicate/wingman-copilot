import { OpenAIEmbeddingSettingsType } from "@shared/types/Settings";

type OpenAIEmbeddingSection = OpenAIEmbeddingSettingsType & {
	onChange: (openAISettings: OpenAIEmbeddingSettingsType) => void;
};

export const OpenAIEmbeddingSettingsView = ({
	dimensions,
	embeddingModel,
	apiKey,
	enabled,
	onChange,
}: OpenAIEmbeddingSection) => {
	const paths = { dimensions, embeddingModel, apiKey, enabled };
	const handleChangeInput = (e: any) => {
		const field = e.target.getAttribute("data-name");
		const clone = { ...paths };
		//@ts-expect-error
		clone[field] = e.target.value;
		onChange(clone);
	};

	const handleCheckboxChange = (e: any) => {
		const field = e.target.getAttribute("data-name");
		const clone = { ...paths };
		//@ts-expect-error
		clone[field] = e.target.checked;
		onChange(clone);
	};

	return (
		<div className="flex flex-col space-y-4">
			<div className="flex flex-col">
				<label
					htmlFor="embeddingModel"
					className="mb-1 text-sm font-medium"
				>
					Embedding model:
				</label>
				<input
					id="embeddingModel"
					type="text"
					className="px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)] border-[var(--vscode-editor-foreground)]"
					onChange={handleChangeInput}
					value={embeddingModel}
					data-name="embeddingModel"
					title="Embedding model"
				/>
			</div>

			<div className="flex flex-col">
				<label
					htmlFor="dimensions"
					className="mb-1 text-sm font-medium"
				>
					Dimensions:
				</label>
				<input
					id="dimensions"
					type="text"
					className="px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)] border-[var(--vscode-editor-foreground)]"
					onChange={handleChangeInput}
					value={dimensions}
					data-name="dimensions"
					title="The dimensions for the embedding model"
				/>
			</div>

			<div className="flex flex-col">
				<label htmlFor="apiKey" className="mb-1 text-sm font-medium">
					Api key:
				</label>
				<input
					id="apiKey"
					type="password"
					className="px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)] border-[var(--vscode-editor-foreground)]"
					onChange={handleChangeInput}
					value={apiKey}
					data-name="apiKey"
					title="OpenAI api key"
				/>
			</div>

			<div className="flex items-center space-x-2">
				<label htmlFor="enabled" className="text-sm font-medium">
					Enabled:
				</label>
				<input
					id="enabled"
					type="checkbox"
					className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
					checked={enabled}
					onChange={handleCheckboxChange}
					data-name="enabled"
					title="Enable OpenAI Embeddings"
				/>
			</div>
		</div>
	);
};
