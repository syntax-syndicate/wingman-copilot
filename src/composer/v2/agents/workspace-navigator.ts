// import { BaseChatModel } from "@langchain/core/language_models/chat_models";
// import { type FileTarget, type UserIntent } from "../types/tools";
// import { PlanExecuteState } from "../types";
// import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
// import { ChatMessage, HumanMessage, MessageContentImageUrl, MessageContentText, SystemMessage } from "@langchain/core/messages";
// import { FileMetadata } from "@shared/types/v2/Message";
// import { DirectoryContent, formatMessages, scanDirectory } from "../../utils";
// import { ProjectDetailsHandler } from "../../../server/project-details";
// import path from "path";
// import { ComposerImage } from "@shared/types/v2/Composer";
// import { VectorQuery } from "../../../server/query";
// import { CodeGraph } from "../../../server/files/graph";
// import { Store } from "../../../store/vector";
// import { getTextDocumentFromPath } from "../../../server/files/utils";

// export class WorkspaceNavigator {
//   private INITIAL_SCAN_DEPTH = 10;
//   private buffer = '';
//   private vectorQuery = new VectorQuery();

//   private readonly DELIMITERS = {
//     TARGETS_START: '===TARGETS_START===',
//     TARGETS_END: '===TARGETS_END===',
//     TARGET_START: '---TARGET---',
//     TARGET_END: '---END_TARGET---',
//     ACKNOWLEDGEMENT_START: '===ACKNOWLEDGEMENT_START===',
//     ACKNOWLEDGEMENT_END: '===ACKNOWLEDGEMENT_END==='
//   } as const;

//   constructor(
//     private readonly model: BaseChatModel,
//     private readonly workspace: string,
//     private readonly codeGraph: CodeGraph,
//     private readonly vectorStore: Store
//   ) { }

//   navigateWorkspace = async (
//     state: PlanExecuteState
//   ) => {
//     const projectDetailsHandler = new ProjectDetailsHandler(this.workspace);
//     const projectDetails = await projectDetailsHandler.retrieveProjectDetails();

//     const generateIntent = async () => {
//       const message = formatMessages(state.messages);

//       const [intent, scannedFiles] = await this.analyzeRequest(message, state.files?.filter(f => f.path !== undefined), state.image, projectDetails?.description);

//       const files: FileMetadata[] = intent.targets.map(f => ({
//         path: f.path!,
//         type: f.type,
//         description: f.description
//       }));

//       return { intent, files, scannedFiles };
//     }

//     let { intent, files, scannedFiles } = await generateIntent();

//     // Workaround - Retry once if no task is found
//     if (!intent?.task) {
//       ({ intent, files, scannedFiles } = await generateIntent());

//       // If still no task after retry, return empty state
//       if (!intent?.task) {
//         return {
//           messages: state.messages
//         } satisfies Partial<PlanExecuteState>;
//       }
//     }

//     const messages = [...state.messages, new ChatMessage(intent.task, "assistant")];

//     const fileDetails: FileMetadata[] = (await Promise.all(
//       files.map(async (file) => {
//         try {
//           const textDocument = await getTextDocumentFromPath(path.join(this.workspace, file.path));
//           const code = textDocument?.getText();
//           return {
//             ...file,
//             code,
//           } as FileMetadata;
//         } catch (error) {
//           console.error(`Error reading file ${file.path}:`, error);
//           return null;
//         }
//       })
//     )).filter((file): file is FileMetadata => file !== null);

//     await dispatchCustomEvent("composer-message-stream-finish", {
//       messages
//     })

//     return {
//       userIntent: { ...intent },
//       messages,
//       files: fileDetails,
//       projectDetails: projectDetails?.description,
//       scannedFiles,
//       feature: undefined
//     } satisfies Partial<PlanExecuteState>;
//   };

//   private async parseStreamingResponse(chunk: string): Promise<Partial<UserIntent>> {
//     this.buffer += chunk;
//     const updates: Partial<UserIntent> = {};

//     // Helper to clean the buffer after processing a section
//     const cleanBuffer = (endDelimiter: string) => {
//       const endIndex = this.buffer.indexOf(endDelimiter) + endDelimiter.length;
//       this.buffer = this.buffer.substring(endIndex);
//     };

//     // Helper to safely extract and trim content
//     const safeExtract = (content: string, pattern: string): string => {
//       const match = content.match(new RegExp(`${pattern}\\s*:\\s*(.*?)(?:\n|$)`));
//       return match?.[1]?.trim() ?? '';
//     };

//     // Process sections in order of expected appearance
//     const processAcknowledgement = async () => {
//       if (!this.buffer.includes(this.DELIMITERS.ACKNOWLEDGEMENT_START)) {
//         return;
//       }

//       const startIndex = this.buffer.indexOf(this.DELIMITERS.ACKNOWLEDGEMENT_START)
//         + this.DELIMITERS.ACKNOWLEDGEMENT_START.length;
//       let endIndex = this.buffer.indexOf(this.DELIMITERS.ACKNOWLEDGEMENT_END);

//       // If we don't have an end delimiter yet, take everything after start
//       if (endIndex === -1) {
//         const taskContent = this.buffer.substring(startIndex).trim();
//         if (taskContent) {
//           updates.task = taskContent;
//           await dispatchCustomEvent("composer-message-stream", taskContent.replace("===ACKNOWLEDGEMENT_END===", "").trim());
//         }
//         return;
//       }

//       // Extract complete acknowledgement section
//       const taskContent = this.buffer
//         .substring(startIndex, endIndex)
//         .trim();

//       if (taskContent) {
//         updates.task = taskContent;
//         cleanBuffer(this.DELIMITERS.ACKNOWLEDGEMENT_END);
//       }
//     };

//     const processTargets = () => {
//       if (!this.buffer.includes(this.DELIMITERS.TARGETS_START)
//         || !this.buffer.includes(this.DELIMITERS.TARGETS_END)) {
//         return;
//       }

//       const targetsContent = this.buffer.substring(
//         this.buffer.indexOf(this.DELIMITERS.TARGETS_START) + this.DELIMITERS.TARGETS_START.length,
//         this.buffer.indexOf(this.DELIMITERS.TARGETS_END)
//       );

//       const targets: FileTarget[] = targetsContent
//         .split(this.DELIMITERS.TARGET_START)
//         .filter(block => block.trim())
//         .map(block => {
//           const content = block.split(this.DELIMITERS.TARGET_END)[0].trim();

//           // Safely extract and normalize type
//           const extractedType = safeExtract(content, 'Type').toUpperCase();
//           const type = extractedType as "CREATE" | "MODIFY" | "ANALYZE";

//           if (!type || !["CREATE", "MODIFY", "ANALYZE"].includes(type)) {
//             return null;
//           }

//           const description = safeExtract(content, 'Description');
//           const rawPath = safeExtract(content, 'Path');

//           if (!rawPath) return null;

//           const normalizedWorkspace = path.normalize(this.workspace);
//           const normalizedPath = path.normalize(rawPath);
//           const absolutePath = path.isAbsolute(normalizedPath)
//             ? normalizedPath
//             : path.resolve(normalizedWorkspace, normalizedPath);

//           const filePath = path
//             .relative(normalizedWorkspace, absolutePath)
//             .split(path.sep)
//             .join('/');

//           return {
//             type,
//             description,
//             path: filePath,
//           } satisfies FileTarget;
//         })
//         .filter(target => target !== null);

//       if (targets.length) {
//         updates.targets = targets;
//       }

//       cleanBuffer(this.DELIMITERS.TARGETS_END);
//     };

//     // Process sections in order
//     await processAcknowledgement();
//     processTargets();

//     return updates;
//   }

//   private async analyzeRequest(question: string, files?: FileMetadata[], image?: ComposerImage, projectDetails?: string): Promise<[UserIntent, DirectoryContent[]]> {
//     const allContents = await scanDirectory(this.workspace, this.INITIAL_SCAN_DEPTH);
//     const contextFiles = await this.vectorQuery.retrieveDocumentsWithRelatedCodeFiles(question, this.codeGraph, this.vectorStore, this.workspace, 10);

//     const fileTargets = allContents
//       .slice(0, 1200)
//       .map(c => `Type: ${c.type}\nPath: ${c.path}`)
//       .join('\n\n');

//     const prompt = `You are a senior full-stack software architect and technical lead.
// Your role is to analyze requests and choose the absolute best files that match the user's request.
// You must think through this step-by-step and consider the user's current implementation context.
// Every response must include an acknowledgement and file targets. This is critical or the application crashes.

// MANDATORY TARGET PATTERNS:
// When the user input matches any of these patterns, the corresponding targets MUST be included:

// 1. Test Creation Pattern:
//    Pattern: "test(s)? for {filename}" or "create test(s)? for {filename}"
//    Required Targets:
//    - {matched_file} -> Type: ANALYZE
//    - {matched_file}.test.{ext} -> Type: CREATE

// 2. File Reference Pattern:
//    Pattern: Any direct mention of a file name
//    Required Target:
//    - {matched_file} -> Type: ANALYZE

// 3. File Modification Pattern:
//    Pattern: "update|modify|change|fix {filename}"
//    Required Target:
//    - {matched_file} -> Type: ANALYZE

// EXAMPLE:
// Input: "Create tests for index"
// Must Generate:
// ---TARGET---
// Type: ANALYZE
// Description: Analyze source file for test implementation
// Path: src/index.ts
// ---END_TARGET---
// ---TARGET---
// Type: CREATE
// Description: Create test file for index
// Path: src/index.test.ts
// ---END_TARGET---

// THIS IS A CRITICAL REQUIREMENT - ALL PATTERN MATCHES MUST GENERATE THESE TARGETS

// File Selection Priority:
// 1. Active Context (Highest Priority)
//     - Recently modified files matching the request
//     - User provided files from the conversation
//     - Files mentioned in the current implementation plan
//     - These files are most likely to be relevant as they represent active work
//     - These may not always be the best match, look for conversational shifts

// 2. Semantic Context (Medium Priority)
//     - Files with matching functionality or purpose
//     - Shared dependencies with active files
//     - Files in similar component categories
//     - Only consider if active context files don't fully solve the request

// 3. Workspace Search (Lower Priority)
//     - Only search here if no matches found above
//     - Look for files matching the technical requirements
//     - Consider common patterns and structures

// 4. Detect Explicit File References
//     - Identify key actionable phrases in the conversation, such as:
//       - "Write tests for xyz"
//       - "Create a new component based on xyz"
//       - "Add implementation for xyz"
//       - "Update xyz"
//       - "Fix xyz"
//       - "Modify xyz"
//       - "Check xyz"
//       - "Review xyz"
//       - "Look at xyz"
//       - "Show me xyz"
//     - Use fuzzy matching to identify potential file references:
//       - Match partial file names (e.g., "index" → "src/index.ts")
//       - Match without extensions (e.g., "UserComponent" → "UserComponent.tsx")
//       - Match basename only (e.g., "auth" → "src/services/auth.service.ts")
//     - If there is a close match for a file under "Available workspace files":
//       1. Compare the mentioned name against all available files
//       2. Score matches based on:
//          - Exact matches (highest priority)
//          - Partial matches at the start of the filename
//          - Partial matches anywhere in the filename
//          - Matches without considering file extension
//       3. Reference the best matching file
//     - Add these files as targets with type "ANALYZE"
//     - When multiple files match, include all relevant matches
//     - Consider context to disambiguate similar file names

// Technical Analysis Steps:
// 1. Review the conversation history
//     - Note any files already being modified
//     - Understand the current implementation plan
//     - Look for user preferences or patterns

// 2. Analyze file relevance
//     - Match against active implementation
//     - Check technical requirements
//     - Consider component relationships
//     - Create a technical and concise description of why the file is relevant

// 3. Score potential matches
//     - Active implementation file and explicit file references: Highest
//     - Recently modified related file: High
//     - Contextually related file: Medium
//     - Pattern/structure match: Low

// 4. Required Target Combinations:
//     - When creating test files:
//         * Add source file as type "ANALYZE"
//         * Add test file as type "CREATE"
//     - When modifying existing files:
//         * Add target file as type "ANALYZE"
//         * Add related files as type "ANALYZE"
//     - When creating new components:
//         * Add template/example files as type "ANALYZE"
//         * Add new component file as type "CREATE"

// 5. Explicit Handling of File References
//     - Automatically include any file mentioned in 'FileTargets' that has a description containing actionable phrases
//     - When a file is referenced (directly or indirectly):
//         * ALWAYS add it as type "ANALYZE"
//         * Add any new related files as appropriate type (CREATE/MODIFY)
//     - For test creation requests:
//         * ALWAYS include both the source file (ANALYZE) and test file (CREATE)

// 6. Match ordering
//     - List files in the order of how you may write them
//     - Leaf files first
//     - Integratin files last

// Note: When creating new files, do not specify directory creation. The system will automatically create necessary directories when creating files.

// File vs Directory Handling:
// 1. Directory Filtering
//     - Directories are provided for context only
//     - Never select a directory as a target
//     - A valid target must be a specific file
//     - Paths ending in '/' are directories
//     - Common directories like 'src/', 'components/', etc. are for context only

// 2. Valid File Targets
//     - Must be individual files with extensions or dot files
//     - Examples: 'src/index.ts', '.env', 'package.json'
//     - Never target patterns like 'src/*.ts' or 'components/'
//     - Configuration files are valid targets even without extensions

// 3. Directory Context Usage
//     - Use directory structure to understand project organization
//     - Reference directory patterns for new file placement
//     - Consider framework-specific directory conventions
//     - Directory structure informs but doesn't determine targets

// 4. Disambiguation Rules
//     - Prefer files in active context
//     - Consider conversation history
//     - Use project structure to inform matches
//     - When in doubt, include all potential matches

// Project Creation Guidelines:
// 1. Framework-Specific Structures
//     - Recognize common framework patterns (React, Vue, Angular, etc.)
//     - Include all necessary configuration files
//     - Set up proper folder structure based on best practices
//     - Include required dependencies in package.json
//     - Set up proper build configuration
//     - Include necessary TypeScript configurations
//     - Set up testing framework structure

// 2. Project Bootstrapping
//     - Include all necessary root-level configuration files
//     - Set up proper environment configuration
//     - Include .gitignore and other VCS files
//     - Set up proper README structure
//     - Include license files if necessary
//     - Set up proper documentation structure

// 3. Common Project Patterns

// Project Type 1 - React:
//     - src/
//       - components/
//       - hooks/
//       - features/
//       - context/
//       - services/
//       - utils/
//       - types/
//       - assets/
//       - styles/
//     - public/
//     - tests/

// ----------

// Project Type 2 - Node.js:
//     - src/
//       - controllers/
//       - models/
//       - routes/
//       - middleware/
//       - utils/
//       - config/
//     - tests/
//     - docs/

// 4. Project Checklist
//     NOTE - This list is not exhaustive.

//     **React**
//     Technologies:
//     - rsbuild or vite if you are unfamiliar with rsbuild
//     - tailwindcss
//     - react-router-dom
//     - typescript
//     - biomejs
//     - tanstack react-query
//     - Zephyr Cloud (plugin for rsbuild)

//     Files:
//     - package.json (Using proper rsbuild commands)
//     - tsconfig.json (if TypeScript)
//     - rsbuild.config.ts
//     - src/index.ts
//     - src/index.css
//     - tailwind.config.js
//     - biomejs
//     - index.html
//     - .gitignore
//     - README.md
    
//     **NodeJS**
//     Technologies:
//     - expressjs
//     - typescript

//     Files:
//     - package.json
//     - tsconfig.json (if TypeScript)
//     - vitest.config.js
//     - nodemon.json
//     - src/index.ts
//     - biomejs
//     - .env.example
//     - .gitignore
//     - README.md

//     Formatter/Linter for javascript/typescript:
//     - Default to biomejs by installing: @biomejs/biome
//     - Create biomejs config file: "biome.json"

//     Testing projects for javascript/typescript:
//     - Default to using vitest, jest is considered legacy now.

//     Projects with rspack:
//     - Install both: @rspack/core, @rspack/cli
//     - Configure based on your knowledge or try to apply your webpack knowledge

//     Projects with rsbuild - best choice for new projects!:
//     - Install both: @rsbuild/core, @rsbuild/plugin-react (vue, svelte, solid, etc)
//     - Here is a sample rsbuild config file:
//       import { defineConfig } from '@rsbuild/core';
//       import { pluginReact } from '@rsbuild/plugin-react';

//       export default defineConfig({
//         plugins: [pluginReact()],
//       });

// Workspace path:
// ${this.workspace}

// ${projectDetails ? `Project details:\n${projectDetails}` : ''}

// Active Implementation Files:
// ${files?.map(file => {
//       if (typeof file === 'object' && file !== null && 'path' in file) {
//         const relativePath = path.relative(this.workspace, (file as FileMetadata).path);
//         const description = (file as FileMetadata).description || '';
//         return description
//           ? `Path: ${relativePath}\nContext: ${description}`
//           : `Path: ${relativePath}\nContext: User provided`;
//       }
//       return `Path: ${path.relative(this.workspace, file)}`;
//     }).join('\n') ?? "None provided."}

// Related Context Files:
// ${Array.from(contextFiles.keys())?.map(file => {
//       if (typeof file === 'object' && file !== null && 'path' in file) {
//         const relativePath = path.relative(this.workspace, (file as FileMetadata).path);
//         const description = (file as FileMetadata).description || '';
//         return description
//           ? `Path: ${relativePath}\nContext: ${description}`
//           : `Path: ${relativePath}`;
//       }
//       return `Path: ${path.relative(this.workspace, file)}`;
//     }).join('\n') ?? "None provided."}

// Available workspace files:
// ${fileTargets}

// -----

// Implementation Context:
// The following conversation shows the current implementation plan and file context.
// Messages are sorted oldest to newest.
// Pay special attention to files being modified and implementation decisions.

// ${question}

// Project Analysis Guidelines:
// 1. Requirements Analysis
//     - Break down high-level requirements into technical components
//     - Identify core features vs nice-to-have features
//     - Map dependencies between components, be specific about how you'll integrate in your description
//     - Consider scalability requirements
//     - Analyze potential technical constraints

// 2. Architecture Planning
//     - Determine appropriate design patterns
//     - Plan component hierarchy and relationships
//     - Identify shared services and utilities
//     - Define data flow and state management
//     - Plan error handling strategy
//     - Consider performance bottlenecks
//     - Design for extensibility

// 3. Implementation Strategy
//     - Break down into logical implementation phases
//     - Identify critical path components
//     - Plan testing strategy and requirements
//     - Consider deployment requirements
//     - Define success criteria for each component
//     - Plan for monitoring and logging
//     - Consider maintenance requirements

// 4. Project Structure Planning
//     - Define folder organization
//     - Plan module boundaries
//     - Identify shared types and interfaces
//     - Plan configuration management
//     - Consider build pipeline requirements
//     - Define naming conventions
//     - Plan documentation structure

// 5. Risk Assessment
//     - Consider integration challenges
//     - Assess third-party dependencies
//     - Plan for potential bottlenecks
//     - Consider security implications
//     - Identify potential maintenance issues
//     - Plan mitigation strategies

// 6. Framework-Specific Considerations
//     - Identify framework-specific best practices
//     - Include necessary framework configurations
//     - Set up proper routing structure
//     - Plan state management approach
//     - Consider component composition
//     - Plan data fetching strategy
//     - Consider SSR/SSG requirements

// 7. Development Environment Setup
//     - Define development tools requirements
//     - Plan local development workflow
//     - Set up debugging configurations
//     - Define code quality tools
//     - Plan hot reload strategy
//     - Consider development vs production configs

// 8. Dependency Management
//     - Identify core dependencies
//     - Plan dependency version strategy
//     - Consider peer dependencies
//     - Plan package manager requirements
//     - Consider monorepo structure if needed
//     - Plan dependency update strategy

// Remember: Focus on creating a complete, well-structured project plan that considers all aspects of development, maintenance, and scalability. The goal is to provide clear direction while maintaining flexibility for implementation details.

// For new projects, the TARGETS response must include:
// 1. Create an appropriate dependency management file (e.g. requirements.txt) with package versions
// 2. All necessary configuration files
// 3. Basic project structure directories
// 4. Essential framework files
// 5. Development environment setup files
// 6. Initial documentation files
// 7. Fully functional projects, if you're creating a new one make sure the user can run it right away
// 8. Create a helpful README

// Note - Skip directories, creating files will create directories.

// CRITICAL TARGET RULES:
// 1. Test Creation Rule
//     When the request involves creating tests for a file:
//     - MUST include the source file as type "ANALYZE"
//     - MUST include the new test file as type "CREATE"
//     Example: For "Create tests for index":
//     - ANALYZE: src/index.ts
//     - CREATE: src/index.test.ts

// 2. File Reference Rule
//     When any file is referenced in the request:
//     - MUST include the referenced file as type "ANALYZE"
//     - Then add any additional files as needed

// 3. Modification Rule
//     When modifying or updating a file:
//     - MUST include the target file as type "ANALYZE"
//     - Then add any additional files as needed

// FAILURE TO INCLUDE THESE REQUIRED TARGETS WILL CAUSE SYSTEM ERRORS.

// ------

// Response Guidelines:
// 1. Be concise and do not repeat yourself. 
// 2. Be conversational but professional. 
// 3. Refer to the USER in the second person and yourself in the first person. 
// 4. Format your responses in markdown.

// Response Format:
// ===ACKNOWLEDGEMENT_START===
// [Brief acknowledgment of request - keep it conversational]

// [For rejection scenarios only - ask how you should proceed]

// [For non-rejection scenarios only]
// ### Implementation Plan

// [Robust, concise and technically in-depth plan]

// Key Changes:
// - [Bullet points listing specific files/components]
// - [Include file names and paths]

// **Would you like me to proceed with these changes?**
// ===ACKNOWLEDGEMENT_END===

// ===TARGETS_START===
// [Internal targets list - not shown to user]
// REMEMBER: Always include source files as ANALYZE when creating tests or when files are referenced!
// ---TARGET---
// Type: [MODIFY,CREATE or ANALYZE]
// Description: [A detailed and concise technical reason of why you chose this file and your plan for it]
// Path: [Workspace relative file path]
// ---END_TARGET---
// ===TARGETS_END===`;

//     let result: UserIntent = {
//       task: '',
//       targets: []
//     };

//     await this.streamResponse(prompt, result, image).catch(async error => {
//       if (error instanceof Error && error.message.includes('does not support image input')) {
//         await this.streamResponse(prompt, result);
//       } else {
//         throw error;
//       }
//     });

//     return [result, allContents];
//   }

//   private async streamResponse(prompt: string, result: UserIntent, image?: ComposerImage) {
//     const msgs: Array<MessageContentText & { cache_control?: Record<string, string> } | MessageContentImageUrl> = [
//       {
//         type: "text",
//         text: prompt,
//         cache_control: { type: "ephemeral" },
//       }
//     ];

//     if (image) {
//       msgs.push({
//         type: "image_url",
//         image_url: {
//           url: image.data,
//         },
//       });
//     }

//     for await (const chunk of await this.model.stream([
//       new HumanMessage({
//         content: msgs,
//       }),
//     ])) {
//       const updates = await this.parseStreamingResponse(chunk.content.toString());

//       if (updates.task) {
//         result.task = updates.task;
//       }

//       if (updates.targets?.length) {
//         result.targets = updates.targets;
//       }
//     }
//   }
// }