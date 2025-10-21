// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface CottonComponent {
	name: string;
	filePath: string;
	docstring?: string;
	variables: string[];
	hasSlots?: boolean;
}

class CottonComponentProvider {
	private components: Map<string, CottonComponent> = new Map();
	private watcher: vscode.FileSystemWatcher | undefined;

	constructor() {
		this.refreshComponents();
		this.setupWatcher();
	}

	private getTemplatesPath(): string | undefined {
		const config = vscode.workspace.getConfiguration('djangoCotton');
		const templatesPath = config.get<string>('templatesPath');
		
		if (!templatesPath) {
			return undefined;
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return undefined;
		}

		return path.join(workspaceFolder.uri.fsPath, templatesPath);
	}

	private setupWatcher() {
		const templatesPath = this.getTemplatesPath();
		if (!templatesPath) {
			return;
		}

		// Watch for changes in Cotton template files
		const pattern = new vscode.RelativePattern(templatesPath, '**/*.{html,cotton.html,cotton}');
		this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
		
		this.watcher.onDidCreate(() => this.refreshComponents());
		this.watcher.onDidChange(() => this.refreshComponents());
		this.watcher.onDidDelete(() => this.refreshComponents());
	}

	public async refreshComponents() {
		this.components.clear();
		const templatesPath = this.getTemplatesPath();
		
		if (!templatesPath || !fs.existsSync(templatesPath)) {
			return;
		}

		try {
			await this.scanDirectory(templatesPath);
		} catch (error) {
			console.error('Error scanning Cotton components:', error);
		}
	}

	private async scanDirectory(dir: string) {
		const files = fs.readdirSync(dir);
		
		for (const file of files) {
			const filePath = path.join(dir, file);
			const stat = fs.statSync(filePath);
			
			if (stat.isDirectory()) {
				await this.scanDirectory(filePath);
			} else if (file.endsWith('.html') || file.endsWith('.cotton.html') || file.endsWith('.cotton')) {
				await this.parseComponent(filePath);
			}
		}
	}

	private async parseComponent(filePath: string) {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			const templatesPath = this.getTemplatesPath();
			if (!templatesPath) {
				return;
			}
			
			// Calculate component name with folder structure
			const relativePath = path.relative(templatesPath, filePath);
			const componentName = relativePath
				.replace(/\.(html|cotton\.html|cotton)$/, '')
				.replace(/[/\\]/g, '.'); // Convert folder separators to dots
			
			// Parse docstring from comment block
			const docstringMatch = content.match(/\{\%\s*comment\s*\%\}([\s\S]*?)\{\%\s*endcomment\s*\%\}/);
			const docstring = docstringMatch ? docstringMatch[1].trim() : undefined;
			
			// Extract variables from template
			const variableMatches = content.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|[^}]*)?\}\}/g);
			const variables = Array.from(variableMatches).map(match => match[1]);
			const uniqueVariables = [...new Set(variables)];
			
			// Check if component has slots (c-slot tags)
			const hasSlots = content.includes('<c-slot') || content.includes('c-slot');
			
			this.components.set(componentName, {
				name: componentName,
				filePath,
				docstring,
				variables: uniqueVariables,
				hasSlots
			});
		} catch (error) {
			console.error(`Error parsing component ${filePath}:`, error);
		}
	}

	getComponents(): CottonComponent[] {
		return Array.from(this.components.values());
	}

	getComponent(name: string): CottonComponent | undefined {
		return this.components.get(name);
	}

	dispose() {
		this.watcher?.dispose();
	}
}

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "django-cotton-highlighting" is now active!');

	const componentProvider = new CottonComponentProvider();

	// Register completion provider for Cotton components
	const cottonCompletionProvider = vscode.languages.registerCompletionItemProvider(
		{ scheme: 'file', pattern: '**/*.{html,htm,cotton,cotton.html}' },
		{
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
				const config = vscode.workspace.getConfiguration('djangoCotton');
				if (!config.get<boolean>('enableAutocompletion', true)) {
					return [];
				}

				// Check if we're typing a Cotton component
				const lineText = document.lineAt(position).text;
				const beforeCursor = lineText.substring(0, position.character);
				
				// Look for <c- pattern - trigger on < or when already typing c- after <
				const triggerPattern = /<c-?[a-zA-Z]*$/;
				if (!triggerPattern.test(beforeCursor) && !beforeCursor.endsWith('<c') && !beforeCursor.endsWith('<')) {
					return [];
				}

				const completionItems: vscode.CompletionItem[] = [];
				const components = componentProvider.getComponents();
				
				// Add completions for discovered components
				components.forEach(component => {
					const item = new vscode.CompletionItem(`c-${component.name}`, vscode.CompletionItemKind.Class);
					
					// Build snippet with component attributes based on variables
					let snippet = `c-${component.name}`;
					
					// Add attributes for variables
					if (component.variables.length > 0) {
						const attributes = component.variables.map((variable, index) => 
							`${variable}="\$${index + 1}"`
						).join(' ');
						snippet += ` ${attributes}`;
					}
					
					// Determine if self-closing or not based on slots
					if (component.hasSlots) {
						// Has slots - use opening/closing tags
						const nextTabStop = component.variables.length + 1;
						snippet += `>\$${nextTabStop}</c-${component.name}>`;
					} else {
						// No slots - use self-closing tag
						snippet += ` />`;
					}
					
					item.insertText = new vscode.SnippetString(snippet);
					
					// Add documentation
					let documentation = `**Cotton Component: ${component.name}**\n\n`;
					if (component.docstring) {
						documentation += `${component.docstring}\n\n`;
					}
					if (component.variables.length > 0) {
						documentation += `**Variables:**\n${component.variables.map(v => `- ${v}`).join('\n')}`;
					}
					
					item.documentation = new vscode.MarkdownString(documentation);
					item.detail = `Cotton Component (${component.variables.length} variables)`;
					
					completionItems.push(item);
				});

				// Add c-slot completion
				const slotCompletion = new vscode.CompletionItem('c-slot', vscode.CompletionItemKind.Snippet);
				slotCompletion.insertText = new vscode.SnippetString('c-slot name="$1">$2</c-slot>');
				slotCompletion.documentation = new vscode.MarkdownString('Insert a Cotton slot component');
				completionItems.push(slotCompletion);

				return completionItems;
			}
		},
		'<', 'c' // trigger characters
	);

	// Register hover provider for Cotton components
	const cottonHoverProvider = vscode.languages.registerHoverProvider(
		{ scheme: 'file', pattern: '**/*.{html,htm,cotton,cotton.html}' },
		{
			provideHover(document, position, token) {
				const range = document.getWordRangeAtPosition(position, /c-[a-zA-Z][a-zA-Z0-9_.-]*/);
				if (!range) {
					return null;
				}
				
				const word = document.getText(range);
				if (!word.startsWith('c-')) {
					return null;
				}
				
				const componentName = word.substring(2); // Remove 'c-' prefix
				const component = componentProvider.getComponent(componentName);
				
				if (component) {
					let hoverText = `**Cotton Component: ${component.name}**\n\n`;
					if (component.docstring) {
						hoverText += `${component.docstring}\n\n`;
					}
					if (component.variables.length > 0) {
						hoverText += `**Variables:**\n${component.variables.map(v => `- ${v}`).join('\n')}\n\n`;
					}
					hoverText += `*File: ${component.filePath}*`;
					
					return new vscode.Hover(new vscode.MarkdownString(hoverText));
				}
				
				return new vscode.Hover([
					'**Cotton Component**',
					'Django Cotton component-based template system allows you to create reusable components.'
				]);
			}
		}
	);

	// Create diagnostic collection for unknown components
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('cottonComponents');

	// Function to validate Cotton components in a document
	function validateCottonComponents(document: vscode.TextDocument) {
		const diagnostics: vscode.Diagnostic[] = [];
		const text = document.getText();
		
		// Find all Cotton component references
		const componentRegex = /<c-([a-zA-Z][a-zA-Z0-9_.-]*)[^>]*>/g;
		let match;
		
		while ((match = componentRegex.exec(text)) !== null) {
			const componentName = match[1];
			const component = componentProvider.getComponent(componentName);
			
			if (!component) {
				const startPos = document.positionAt(match.index + 3); // Position after '<c-'
				const endPos = document.positionAt(match.index + 3 + componentName.length);
				const range = new vscode.Range(startPos, endPos);
				
				const diagnostic = new vscode.Diagnostic(
					range,
					`Unknown Cotton component: ${componentName}`,
					vscode.DiagnosticSeverity.Error
				);
				diagnostic.code = 'cotton-unknown-component';
				diagnostic.source = 'Django Cotton';
				diagnostics.push(diagnostic);
			}
		}
		
		diagnosticCollection.set(document.uri, diagnostics);
	}

	// Register document change listeners for diagnostics
	const activeDocumentWatcher = vscode.workspace.onDidChangeTextDocument(event => {
		const document = event.document;
		if (document.languageId === 'html' || document.languageId === 'cotton' || 
			document.fileName.endsWith('.html') || document.fileName.endsWith('.cotton.html')) {
			validateCottonComponents(document);
		}
	});

	const openDocumentWatcher = vscode.workspace.onDidOpenTextDocument(document => {
		if (document.languageId === 'html' || document.languageId === 'cotton' || 
			document.fileName.endsWith('.html') || document.fileName.endsWith('.cotton.html')) {
			validateCottonComponents(document);
		}
	});

	// Validate all currently open documents when components are refreshed
	const originalRefreshComponents = componentProvider.refreshComponents.bind(componentProvider);
	componentProvider.refreshComponents = async function() {
		await originalRefreshComponents();
		// Re-validate all open documents after components refresh
		vscode.workspace.textDocuments.forEach(document => {
			if (document.languageId === 'html' || document.languageId === 'cotton' || 
				document.fileName.endsWith('.html') || document.fileName.endsWith('.cotton.html')) {
				validateCottonComponents(document);
			}
		});
	};

	// Validate currently open documents on activation
	vscode.workspace.textDocuments.forEach(document => {
		if (document.languageId === 'html' || document.languageId === 'cotton' || 
			document.fileName.endsWith('.html') || document.fileName.endsWith('.cotton.html')) {
			validateCottonComponents(document);
		}
	});

	// Command to refresh components
	const refreshCommand = vscode.commands.registerCommand('django-cotton-highlighting.refreshComponents', () => {
		componentProvider.refreshComponents();
		vscode.window.showInformationMessage('Cotton components refreshed!');
	});

	// The hello world command
	const disposable = vscode.commands.registerCommand('django-cotton-highlighting.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Django Cotton!');
	});

	// Listen for configuration changes
	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('djangoCotton.templatesPath')) {
			componentProvider.refreshComponents();
		}
	});

	context.subscriptions.push(
		disposable,
		refreshCommand,
		cottonCompletionProvider,
		cottonHoverProvider,
		componentProvider,
		configWatcher,
		diagnosticCollection,
		activeDocumentWatcher,
		openDocumentWatcher
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
