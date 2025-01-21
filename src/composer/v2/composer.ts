import { Command, END, interrupt, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver, StateGraphArgs } from "@langchain/langgraph";
import { ChatMessage } from "@langchain/core/messages";
import { CodeGraph } from "../../server/files/graph";
import { RunnableConfig } from "@langchain/core/runnables";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Store } from "../../store/vector.js";
import { PlanExecuteState } from "./types/index";
import { NoFilesChangedError, NoFilesFoundError } from "../errors";
import { ComposerRequest } from "@shared/types/Composer";
import { WorkspaceNavigator } from "./tools/workspace-navigator";
import { UserIntent } from "./types/tools";
import { FileMetadata } from "@shared/types/v2/Message";
import { CodeWriter } from "./tools/code-writer";
import path, { join } from "node:path";
import { getTextDocumentFromPath } from "../../server/files/utils";
import { DirectoryContent } from "../utils";
import { DependencyManager } from "./tools/dependency-manager";
import { Dependencies } from "@shared/types/v2/Composer";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";

export interface Thread {
    configurable: {
        thread_id: string;
    };
}

let controller = new AbortController();

export function cancelComposer() {
    controller.abort();
}

export class ComposerGraph {
    private workflow: StateGraph<PlanExecuteState>;

    constructor(private readonly workspace: string,
        private readonly model: BaseChatModel,
        private readonly rerankModel: BaseChatModel,
        private readonly codeGraph: CodeGraph,
        private readonly store: Store,
        private readonly config?: RunnableConfig,
        private readonly checkpointer?: BaseCheckpointSaver) {

        const workspaceNavigator = new WorkspaceNavigator(this.model, this.workspace, this.codeGraph, this.store);
        const codeWriter = new CodeWriter(this.model, this.rerankModel, this.workspace);
        const dependencyManager = new DependencyManager(this.model, this.rerankModel, this.workspace);

        const planExecuteState: StateGraphArgs<PlanExecuteState>["channels"] = {
            messages: {
                value: (_x: ChatMessage[], y: ChatMessage[]) => y,
                default: undefined
            },
            userIntent: {
                value: (x?: UserIntent, y?: UserIntent) => y ?? x,
                default: () => undefined,
            },
            files: {
                value: (x?: FileMetadata[], y?: FileMetadata[]) => y ?? x,
                default: () => undefined,
            },
            scannedFiles: {
                value: (x?: DirectoryContent[], y?: DirectoryContent[]) => y ?? x,
                default: () => undefined,
            },
            error: {
                value: (x?: string, y?: string) => y ?? x,
                default: () => undefined,
            },
            projectDetails: {
                value: (x?: string, y?: string) => y ?? x,
                default: () => undefined,
            },
            dependencies: {
                value: (x?: Dependencies, y?: Dependencies) => y ?? x,
                default: () => undefined,
            },
            image: {
                value: (
                    x?: ComposerRequest["image"],
                    y?: ComposerRequest["image"]
                ) => y ?? x,
            },
            greeting: {
                value: (_x?: string, y?: string) => y,
                default: () => undefined
            }
        };

        //@ts-expect-error
        this.workflow = new StateGraph({
            channels: planExecuteState,
        })
            .addNode("find", workspaceNavigator.navigateWorkspace, {
                ends: ["human-feedback"]
            })
            .addNode("human-feedback", this.humanFeedback, {
                ends: ["find", "code-writer"]
            })
            .addNode("code-writer", codeWriter.codeWriterStep, {
                ends: ["dependency-manager"],
            })
            .addNode("dependency-manager", dependencyManager.generateManualSteps, {
                ends: [END]
            })
            .addEdge(START, "find")
            .addEdge("find", "human-feedback")
            .addEdge("code-writer", "dependency-manager");
    }

    rejectFile = async (file: FileMetadata) => {
        const graph = this.workflow.compile({ checkpointer: this.checkpointer });
        const state = await graph.getState({ ...this.config });

        const relativePath = path.relative(this.workspace, file.path);

        const graphFiles = (state.values as PlanExecuteState).files;
        const matchedFile = graphFiles?.find(f => f.path === relativePath);

        if (!matchedFile) return;

        const txtDoc = await getTextDocumentFromPath(join(this.workspace, matchedFile.path));
        matchedFile.code = txtDoc?.getText();

        matchedFile.rejected = true;
        matchedFile.accepted = false;

        graph.updateState({ ...this.config }, {
            files: graphFiles
        })

        return {
            ...state.values,
            files: graphFiles
        }
    }

    acceptFile = async (file: FileMetadata) => {
        const graph = this.workflow.compile({ checkpointer: this.checkpointer });
        const state = await graph.getState({ ...this.config });

        const relativePath = path.relative(this.workspace, file.path);

        const graphFiles = (state.values as PlanExecuteState).files;
        const matchedFile = graphFiles?.find(f => f.path === relativePath);

        if (!matchedFile) return;

        matchedFile.accepted = true;
        matchedFile.rejected = false;

        graph.updateState({ ...this.config }, {
            files: graphFiles
        });

        return {
            ...state.values,
            files: graphFiles
        };
    }

    humanFeedback = async (state: PlanExecuteState) => {
        const lastMessage = state.messages[state.messages.length - 1];
        const interruptState = interrupt(lastMessage) as Partial<PlanExecuteState>;
        const userMessage = interruptState.messages![0].content.toString();
        const messages = [...state.messages, new ChatMessage(userMessage, "user")];

        if (state.files?.length === 0) {
            return new Command({
                goto: "find",
                update: {
                    messages
                } satisfies Partial<PlanExecuteState>
            })
        }

        const isPositive = await this.rerankModel.invoke(
            `Analyze this response and determine if it's a positive confirmation or any other type of response.

Rules:
- Respond with 'yes' ONLY for clear positive confirmations like:
    - "yes", "sure", "okay", "proceed"
    - "looks good", "that's correct"
    - "go ahead", "sounds good"
- Respond with 'no' for:
    - Any instructions or requests
    - Questions or queries
    - Greetings (like "hi", "hello")
    - Ambiguous or unclear responses
    - General comments or statements
    - Any specific directions or modifications
    - Partial agreements with conditions
- You must only respond with 'yes' or 'no', do not add any additional text

Examples:
- "Yes, go ahead" -> "yes"
- "Looks good" -> "yes"
- "That works perfectly" -> "yes"
- "Hi" -> "no"
- "Hello there" -> "no"
- "Can you change X" -> "no"
- "Instead, do this" -> "no"
- "Maybe" -> "no"
- "Yes, but can you..." -> "no"
- "That's interesting" -> "no"

Note: Examples above are not exhaustive, use your best judgement!

Response: ${userMessage}

Answer (yes/no):`
        );

        if (isPositive.content.toString().toLowerCase().includes('yes')) {
            return new Command({
                goto: "code-writer",
                update: {
                    messages
                } satisfies Partial<PlanExecuteState>,
            });
        }

        return new Command({
            goto: "find",
            update: {
                messages
            } satisfies Partial<PlanExecuteState>
        });
    };

    async *execute(
        request: ComposerRequest,
    ) {
        controller = new AbortController();
        const graph = this.workflow.compile({ checkpointer: this.checkpointer });

        let inputs: Partial<PlanExecuteState> = {};
        inputs.messages = [new ChatMessage(request.input, "user")];

        if (request.contextFiles) {
            const codeFiles: FileMetadata[] = [];
            const existingPaths = new Set(inputs.files?.map(f => f.path) ?? []);

            for (const file of request.contextFiles) {
                try {
                    const relativePath = path.relative(this.workspace, file);
                    // Skip if we already have this file in inputs
                    if (existingPaths.has(relativePath)) {
                        continue;
                    }

                    const txtDoc = await getTextDocumentFromPath(path.join(this.workspace, relativePath));
                    codeFiles.push({
                        path: relativePath,
                        code: txtDoc?.getText(),
                    });
                } catch { }
            }

            if (!inputs.files || !Array.isArray(inputs.files)) {
                inputs.files = [];
            }

            inputs.files = [...(inputs.files ?? []), ...codeFiles];
        }

        if (request.image) {
            inputs.image = request.image;
        }

        const state = await graph.getState({ ...this.config });

        try {
            const graphInput = state?.tasks.length > 0 ? new Command({
                resume: {
                    messages: inputs.messages
                }
            }) : inputs;

            const streamingGraph = await graph.streamEvents(graphInput, {
                streamMode: ["custom"],
                signal: controller.signal,
                version: "v2",
                ...this.config
            });

            for await (const chunk of streamingGraph) {
                if (!chunk) continue;

                const { event, name, data } = chunk;
                if (event === "on_custom_event") {
                    yield { node: name, values: data };
                }
            }

            const graphState = await graph.getState({ ...this.config });

            if (graphState.tasks?.length > 0 && graphState.tasks[0].name === "human-feedback" &&
                graphState.tasks[0].interrupts?.length > 0
            ) {
                yield {
                    node: "assistant-question", values: {
                        messages: (graphState.values as Partial<PlanExecuteState>).messages,
                        greeting: (graphState.values as Partial<PlanExecuteState>).greeting
                    } satisfies Partial<PlanExecuteState>
                }
            }
        } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") {
                yield {
                    node: "composer-error",
                    values: {
                        error: "Operation was cancelled",
                    },
                };
                return;
            } else if (e instanceof NoFilesChangedError) {
                yield {
                    node: "composer-error",
                    values: {
                        error:
                            "I was not able to generate any changes. Please try again with a different question or try explicitly referencing files.",
                    },
                };
                return;
            } else if (e instanceof NoFilesFoundError) {
                yield {
                    node: "composer-error",
                    values: {
                        error:
                            "I was unable to find any indexed code files. Please reference files directly using '@filename', build the full index or make sure embeddings are enabled in settings.",
                    },
                };
                return;
            }

            console.error(e);
            yield {
                node: "composer-error",
                values: {
                    error:
                        "An error occurred, please try again. If this continues use the clear chat button to start over.",
                },
            };
        }
    }
}
