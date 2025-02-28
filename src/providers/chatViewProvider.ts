import * as vscode from "vscode";
import fs from "node:fs";
import { eventEmitter } from "../events/eventEmitter";
import type { AppMessage, CodeContextDetails } from "@shared/types/Message";
import type { AppState, Thread } from "@shared/types/Settings";
import type {
	AcceptFileEvent,
	AddMessageToThreadEvent,
	RenameThreadEvent,
	RejectFileEvent,
	UndoFileEvent,
} from "@shared/types/Events";
import {
	addNoneAttributeToLink,
	extractCodeBlock,
	getActiveWorkspace,
	getNonce,
} from "./utilities";
import type { LSPClient } from "../client/index";
import type {
	ComposerRequest,
	DiffViewCommand,
	FileSearchResult,
} from "@shared/types/v2/Composer";
import type { DiffViewProvider } from "./diffViewProvider";
import type { Workspace } from "../service/workspace";
import { getGitignorePatterns } from "../server/files/utils";
import type { ConfigViewProvider } from "./configViewProvider";
import path from "node:path";
import type { FileMetadata } from "@shared/types/v2/Message";
import type { ThreadViewProvider } from "./threadViewProvider";
import { getRecentFileTracker } from "./recentFileTracker";

export type ChatView = "composer" | "indexer";

export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "wingman.chatview";
	public static readonly showComposerCommand = "wingmanai.opencomposer";

	private _disposables: vscode.Disposable[] = [];
	private _webview: vscode.Webview | undefined;
	private _launchView: ChatView = "composer";

	constructor(
		private readonly _lspClient: LSPClient,
		private readonly _context: vscode.ExtensionContext,
		private readonly _diffViewProvider: DiffViewProvider,
		private readonly _threadViewProvider: ThreadViewProvider,
		private readonly _workspace: Workspace,
		private readonly _settingsViewProvider: ConfigViewProvider,
	) {}

	dispose() {
		// biome-ignore lint/complexity/noForEach: <explanation>
		this._disposables.forEach((d) => d.dispose());
		this._disposables = [];
	}

	public setLaunchView(view: ChatView) {
		if (this._webview) {
			this.showView(view);
			return;
		}

		this._launchView = view;
	}

	showView(view: ChatView) {
		if (!view) {
			return;
		}
		this._webview?.postMessage({
			command: "switchView",
			value: view,
		});
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		token: vscode.CancellationToken,
	) {
		this._webview = webviewView.webview;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._context.extensionUri, "media"),
				vscode.Uri.joinPath(this._context.extensionUri, "out"),
			],
		};

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		this._lspClient.setComposerWebViewReference(webviewView.webview);

		token.onCancellationRequested((e) => {
			this._lspClient.cancelComposer();
			eventEmitter._onQueryComplete.fire();
		});

		this._disposables.push(
			webviewView.webview.onDidReceiveMessage(async (data: AppMessage) => {
				if (!data) {
					return;
				}

				const { command, value } = data;

				this._lspClient.onIndexUpdated((stats) => {
					webviewView.webview.postMessage({
						command: "index-status",
						value: stats,
					});
				});

				// TODO - move to a mediator pattern
				switch (command) {
					case "add-message-to-thread":
						await this.addMessageToThread(value as AddMessageToThreadEvent);
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "create-thread":
						await this.createThread(value as Thread);
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "branch-thread":
						await this.branchThread(value as Thread);
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "switch-thread":
						await this.switchThread(String(value));
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "delete-thread":
						await this.deleteThread(String(value));
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "rename-thread":
						await this.renameThread(value as RenameThreadEvent);
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "visualize-threads":
						this._threadViewProvider.visualizeThreads(
							this._workspace.getSettings(),
						);
						break;
					case "accept-file":
						await this.acceptFile(value as AcceptFileEvent);
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "reject-file":
						await this.rejectFile(value as RejectFileEvent);
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "undo-file":
						await this.undoFile(value as UndoFileEvent);
						webviewView.webview.postMessage({
							command: "thread-data",
							value: this._workspace.getSettings(),
						});
						break;
					case "open-file":
						await vscode.commands.executeCommand(
							"vscode.open",
							vscode.Uri.file(
								path.join(
									this._workspace.workspacePath,
									(value as FileMetadata).path,
								),
							),
						);
						break;

					case "openSettings":
						this._settingsViewProvider.openInPanel();
						break;
					case "diff-view": {
						const { file, threadId } = value as DiffViewCommand;
						file.original = await this._lspClient.fetchOriginalFileContents({
							file: file.path,
							threadId,
						});
						this._diffViewProvider.createDiffView({
							file,
							onAccept: async (file: FileMetadata, threadId: string) => {
								await this.acceptFile({ file, threadId });
							},
							onReject: async (file: FileMetadata, threadId: string) => {
								await this.rejectFile({ file, threadId });
							},
							threadId,
						});
						break;
					}
					case "clear-chat-history":
						this.clearChatHistory();
						break;
					case "get-files": {
						const searchTerm = value as string | undefined;
						if (!searchTerm || searchTerm?.length === 0) {
							return [];
						}

						const settings = await this._workspace.load();

						// Find all files in the workspace that match the search term
						const matchingFiles = await vscode.workspace.findFiles(
							"**/*",
							(await getGitignorePatterns(this._workspace.workspacePath)) || "",
						);

						// Convert to relative paths
						const filteredFiles: FileSearchResult[] = matchingFiles
							.filter((f) => f.fsPath.includes(searchTerm))
							.map((file) => {
								const path = vscode.workspace.asRelativePath(file.fsPath);
								return {
									file: String(path.split("/").pop()),
									path,
								} satisfies FileSearchResult;
							});

						webviewView.webview.postMessage({
							command: "get-files-result",
							value: filteredFiles,
						});
						break;
					}
					case "compose":
						await this._lspClient.compose({
							...(value as ComposerRequest),
							context: getChatContext(1024),
							recentFiles: getRecentFileTracker().getRecentFiles(),
						});
						break;
					case "cancel": {
						await this._lspClient.cancelComposer();
						break;
					}
					case "ready": {
						const settings = await this._workspace.load();
						const appState: AppState = {
							workspaceFolder: getActiveWorkspace(),
							theme: vscode.window.activeColorTheme.kind,
							threads: settings.threads,
							activeThreadId: settings.activeThreadId,
							settings,
							totalFiles: 0,
						};

						webviewView.webview.postMessage({
							command: "init",
							value: appState,
						});

						webviewView.webview.postMessage({
							command: "thread-data",
							value: settings,
						});
						this.showView(this._launchView);
						break;
					}
				}
			}),
			vscode.window.onDidChangeActiveColorTheme((theme: vscode.ColorTheme) => {
				webviewView.webview.postMessage({
					command: "setTheme",
					value: theme.kind,
				});
			}),
		);
	}

	private async undoFile({ file, threadId }: UndoFileEvent) {
		try {
			// Get file path and request undo operation
			const { path: artifactFile, id: fileId } = file;
			const relativeFilePath = vscode.workspace.asRelativePath(artifactFile);
			const graphState = await this._lspClient.undoComposerFile({
				file,
				threadId,
			});

			// Get file URI for workspace operations
			const fileUri = vscode.Uri.joinPath(
				vscode.Uri.parse(this._workspace.workspacePath),
				relativeFilePath,
			);

			// Restore original content or delete file
			const original = graphState.files.find((f) => f.path === file.path);
			if (original?.original) {
				await vscode.workspace.fs.writeFile(
					fileUri,
					new TextEncoder().encode(original.original),
				);
			} else {
				await vscode.workspace.fs.delete(fileUri);
			}

			// Update thread metadata
			const targetThread = await this._workspace.getThreadById(threadId);
			if (!targetThread) return;

			// Find and update the file event
			for (const message of targetThread.messages) {
				if (message.from !== "assistant") continue;
				if (!message.events?.some((e) => !!e.metadata?.tool)) continue;

				const fileEvent = message.events
					.filter((e) => e.metadata?.tool === "write_file")
					.find((e) => {
						const fileContents = JSON.parse(e.content) as FileMetadata;
						return fileId === fileContents.id;
					});

				if (fileEvent) {
					// Reset file status
					const fileContents = JSON.parse(fileEvent.content) as FileMetadata;
					fileContents.accepted = false;
					fileContents.rejected = false;
					fileEvent.content = JSON.stringify(fileContents);

					// Update thread and notify UI
					await this._lspClient.undoComposerFile({ file, threadId });
					await this._workspace.updateThread(threadId, targetThread);
					this._webview?.postMessage({
						command: "thread-data",
						value: this._workspace.getSettings(),
					});
					return;
				}
			}
		} catch (error) {
			console.error("Error undoing file changes:", error);
			// Consider showing an error notification to the user
		}
	}

	private async acceptFile({ file, threadId }: AcceptFileEvent): Promise<void> {
		const targetThread = await this._workspace.getThreadById(threadId);
		if (!targetThread) return;

		const relativeFilePath = vscode.workspace.asRelativePath(file.path);
		const fileUri = vscode.Uri.joinPath(
			vscode.Uri.parse(this._workspace.workspacePath),
			relativeFilePath,
		);
		await vscode.workspace.fs.writeFile(
			fileUri,
			new TextEncoder().encode(file.code),
		);

		// Find the first matching file and update it
		for (const message of targetThread.messages) {
			if (message.from !== "assistant") continue;

			const fileEvent = message.events?.find(
				(event) =>
					event.metadata?.tool === "write_file" &&
					JSON.parse(event.content).id === file.id,
			);

			if (fileEvent) {
				const fileContent = JSON.parse(fileEvent.content) as FileMetadata;
				fileContent.accepted = true;
				fileContent.rejected = false;
				fileEvent.content = JSON.stringify(fileContent);

				await this._lspClient.acceptComposerFile({ file, threadId });
				await this._workspace.updateThread(threadId, targetThread);
				this._webview?.postMessage({
					command: "thread-data",
					value: this._workspace.getSettings(),
				});
				return;
			}
		}
	}

	private async rejectFile({ file, threadId }: AcceptFileEvent) {
		try {
			// Extract and process code content
			const { path: artifactFile, code: markdown, id: fileId } = file;
			const code = markdown?.startsWith("```")
				? extractCodeBlock(markdown)
				: markdown;

			// Write file to workspace
			const relativeFilePath = vscode.workspace.asRelativePath(artifactFile);
			const fileUri = vscode.Uri.joinPath(
				vscode.Uri.parse(this._workspace.workspacePath),
				relativeFilePath,
			);
			await vscode.workspace.fs.writeFile(
				fileUri,
				new TextEncoder().encode(code),
			);

			// Update thread metadata
			const targetThread = await this._workspace.getThreadById(threadId);
			if (!targetThread) return;

			// Find the relevant message and file event
			for (const message of targetThread.messages) {
				if (message.from !== "assistant") continue;
				if (!message.events?.some((e) => !!e.metadata?.tool)) continue;

				const fileEvent = message.events
					.filter((e) => e.metadata?.tool === "write_file")
					.find((e) => {
						const fileContents = JSON.parse(e.content) as FileMetadata;
						return fileId === e.id || fileId === fileContents.id;
					});

				if (fileEvent) {
					// Update file metadata
					const fileContents = JSON.parse(fileEvent.content) as FileMetadata;
					fileContents.accepted = false;
					fileContents.rejected = true;
					fileEvent.content = JSON.stringify(fileContents);

					// Save changes and notify UI
					await this._lspClient.rejectComposerFile({ file, threadId });
					await this._workspace.updateThread(threadId, targetThread);
					this._webview?.postMessage({
						command: "thread-data",
						value: this._workspace.getSettings(),
					});
					return;
				}
			}
		} catch (error) {
			console.error("Error rejecting file:", error);
		}
	}

	private async clearChatHistory() {
		const settings = this._workspace.getSettings();

		if (settings.activeThreadId) {
			await this._workspace.updateThread(settings.activeThreadId, {
				messages: [],
			});
			await this._lspClient.clearChatHistory(settings.activeThreadId);
		}
	}

	private async deleteThread(threadId: string) {
		await this._lspClient.deleteThread(threadId);
		await this._workspace.deleteThread(threadId);
	}

	private async renameThread({ threadId, title }: RenameThreadEvent) {
		await this._workspace.updateThread(threadId, { title });
	}

	private async switchThread(threadId: string) {
		await this._workspace.switchThread(threadId);
	}

	private async createThread(thread: Thread) {
		await this._workspace.createThread(thread.title);
	}

	private async branchThread(thread: Thread) {
		await this._workspace.branchThread(thread);
		await this._lspClient.branchThread({
			threadId: thread.id,
			originalThreadId: thread.originatingThreadId,
		});
	}

	private async addMessageToThread({
		threadId,
		message,
	}: AddMessageToThreadEvent) {
		const activeThread = await this._workspace.getThreadById(threadId);

		if (activeThread) {
			activeThread.messages.push(message);
			await this._workspace.updateThread(threadId, activeThread);
			return;
		}

		const words = message.message.split(" ");
		let threadTitle = words.slice(0, 5).join(" ");
		if (threadTitle.length > 30) {
			threadTitle = `${threadTitle.substring(0, 27)}...`;
		}

		await this._workspace.createThread(threadTitle, [message]);
	}

	private getHtmlForWebview(webview: vscode.Webview) {
		const htmlUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this._context.extensionUri,
				"out",
				"views",
				"chat.html",
			),
		);

		const nonce = getNonce();

		const htmlContent = fs.readFileSync(htmlUri.fsPath, "utf8");
		const imageUri = getImageUri(webview, this._context, [
			"media",
			vscode.window.activeColorTheme.kind === 1
				? "Logo-black.png"
				: "Logo-white.png",
		]);

		// Replace placeholders in the HTML content
		const finalHtmlContent = htmlContent
			.replace(/CSP_NONCE_PLACEHOLDER/g, nonce)
			.replace("LOGO_URL", imageUri.toString());

		const prefix = webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, "out", "views"),
		);
		const srcHrefRegex = /(src|href)="([^"]+)"/g;

		// Replace the matched filename with the prefixed filename
		const updatedHtmlContent = finalHtmlContent.replace(
			srcHrefRegex,
			(match, attribute, filename) => {
				const prefixedFilename = `${prefix}${filename}`;
				return `${attribute}="${prefixedFilename}"`;
			},
		);

		return addNoneAttributeToLink(updatedHtmlContent, nonce);
	}
}

function getChatContext(contextWindow: number): CodeContextDetails | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return undefined;
	}

	const { document, selection } = editor;
	let codeContextRange: vscode.Range;
	let lastDirection = -1;

	if (selection && !selection.isEmpty) {
		codeContextRange = new vscode.Range(
			selection.start.line,
			selection.start.character,
			selection.end.line,
			selection.end.character,
		);
	} else {
		const currentLine = selection.active.line;
		let upperLine = currentLine;
		let lowerLine = currentLine;

		const halfContext = Math.floor(contextWindow / 2);

		let upperText = upperLine > 0 ? document.lineAt(upperLine - 1).text : "";
		let lowerText = document.lineAt(lowerLine).text;

		// Expand context in both directions
		for (let i = 0; i < halfContext; i++) {
			if (upperLine > 0) {
				upperLine--;
				upperText = `${document.lineAt(upperLine).text}\n${upperText}`;
				lastDirection = 0;
			}

			if (lowerLine < document.lineCount - 1) {
				lowerLine++;
				lowerText += `\n${document.lineAt(lowerLine).text}`;
				lastDirection = 1;
			}

			// Stop if we've reached the context window size
			if (upperText.length + lowerText.length >= contextWindow) {
				break;
			}
		}

		const beginningWindowLine = document.lineAt(upperLine);
		const endWindowLine = document.lineAt(lowerLine);

		codeContextRange = new vscode.Range(
			beginningWindowLine.range.start,
			endWindowLine.range.end,
		);
	}

	let text = document.getText(codeContextRange);

	if (text.length > contextWindow) {
		if (lastDirection === 0) {
			text = text.substring(text.length - contextWindow, text.length);
		} else if (lastDirection === 1) {
			text = text.substring(0, contextWindow);
		}
	}

	const documentUri = vscode.Uri.file(document.fileName);
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);

	return {
		text,
		currentLine: document.lineAt(selection.active.line).text,
		lineRange: `${codeContextRange.start.line}-${codeContextRange.end.line}`,
		fileName: document.fileName,
		workspaceName: workspaceFolder?.name ?? "",
		language: document.languageId,
		fromSelection: !selection.isEmpty,
	};
}

function getImageUri(
	webview: vscode.Webview,
	context: vscode.ExtensionContext,
	imagePath: string[],
) {
	return webview.asWebviewUri(
		vscode.Uri.joinPath(context.extensionUri, ...imagePath),
	);
}
