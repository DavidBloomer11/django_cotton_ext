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
		
		this.watcher.onDidCreate(() => {
			this.refreshComponents();
			this.onComponentsChanged?.();
		});
		this.watcher.onDidChange(() => {
			this.refreshComponents();
			this.onComponentsChanged?.();
		});
		this.watcher.onDidDelete(() => {
			this.refreshComponents();
			this.onComponentsChanged?.();
		});
	}

	// Event handler for component changes
	public onComponentsChanged?: () => void;

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
			let baseName = relativePath
				.replace(/\.(html|cotton\.html|cotton)$/, '')
				.replace(/[/\\]/g, '.'); // Convert folder separators to dots
			
			// Register component with original name (snake_case preserved)
			const snakeCaseName = baseName;
			
			// Also create kebab-case variant for lookup
			const kebabCaseName = baseName.replace(/_/g, '-');
			
			// Parse docstring from comment block
			const docstringMatch = content.match(/\{\%\s*comment\s*\%\}([\s\S]*?)\{\%\s*endcomment\s*\%\}/);
			const docstring = docstringMatch ? docstringMatch[1].trim() : undefined;
			
			// Extract variables from template
			const allVariables: string[] = [];
			
			// 1. Variables in {{ variable }} or {{ variable.property }} or {{ variable|filter }}
			const doublebraceMatches = content.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_]+)*\s*(?:\|[^}]*)?\}\}/g);
			for (const match of doublebraceMatches) {
				allVariables.push(match[1]);
			}
			
			// 2. Variables in {% for item in collection %} - extract 'collection'
			const forLoopMatches = content.matchAll(/\{\%\s*for\s+\w+\s+in\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_]+)*\s*\%\}/g);
			for (const match of forLoopMatches) {
				allVariables.push(match[1]);
			}
			
			// 3. Variables in {% if variable %} or {% if variable.property %} or {% elif variable %}
			const ifMatches = content.matchAll(/\{\%\s*(?:if|elif)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_]+)*(?:\s|\%)/g);
			for (const match of ifMatches) {
				allVariables.push(match[1]);
			}
			
			// 4. Variables in {% with var=value %} - extract variables on right side
			const withMatches = content.matchAll(/\{\%\s*with\s+(?:\w+=)?([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_]+)*/g);
			for (const match of withMatches) {
				allVariables.push(match[1]);
			}
			
			// 5. Variables passed to custom template tags (common pattern: {% tag var1 var2 %})
			// Look for words after known tag names that look like variables
			const customTagMatches = content.matchAll(/\{\%\s*(?:render_\w+|include|url)\s+[^%]*?([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_]+)*(?=\s|\%)/g);
			for (const match of customTagMatches) {
				// Skip quoted strings and tag names
				if (!match[1].startsWith('"') && !match[1].startsWith("'")) {
					allVariables.push(match[1]);
				}
			}
			
			// 6. Any variable-like tokens in template tags that follow common patterns
			// This catches things like {% sometag object field request.user %}
			const genericTagMatches = content.matchAll(/\{\%[^%]+\%\}/g);
			for (const tagMatch of genericTagMatches) {
				const tagContent = tagMatch[0];
				// Skip comment blocks, for/endfor, if/endif, etc.
				if (/\{\%\s*(end|comment|load|extends|block)/.test(tagContent)) {
					continue;
				}
				// Find potential variables (not in quotes, not keywords)
				const potentialVars = tagContent.matchAll(/(?<=[\s,=])([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_]+)*(?=[\s%,])/g);
				for (const varMatch of potentialVars) {
					allVariables.push(varMatch[1]);
				}
			}
			
			// Filter out Django Cotton special variables, loop variables, and common Django variables
			const excludedVariables = new Set([
				'slot', 'attrs', 'forloop', 'block', 'csrf_token',
				'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is',
				'if', 'else', 'elif', 'endif', 'for', 'endfor', 'empty',
				'with', 'endwith', 'include', 'extends', 'block', 'endblock',
				'load', 'static', 'url', 'csrf_token', 'comment', 'endcomment',
				'as', 'by', 'from', 'import', 'cycle', 'firstof', 'now',
				'regroup', 'spaceless', 'templatetag', 'widthratio',
				'item', 'object', 'key', 'value' // Common loop variable names to exclude
			]);
			const variables = allVariables.filter(variable => 
				!excludedVariables.has(variable) && 
				variable.length > 1 && // Skip single-char variables
				!/^[A-Z_]+$/.test(variable) // Skip constants
			);
			const uniqueVariables = [...new Set(variables)];
			
			// Check if component has slots
			const hasDefaultSlot = content.includes('{{ slot }}');
			const hasNamedSlots = content.includes('<c-slot');
			const hasSlots = hasDefaultSlot || hasNamedSlots;
			
			const componentData: CottonComponent = {
				name: snakeCaseName, // Use snake_case as the canonical name
				filePath,
				docstring,
				variables: uniqueVariables,
				hasSlots
			};
			
			// Register under snake_case name
			this.components.set(snakeCaseName, componentData);
			
			// Also register under kebab-case name if different
			if (kebabCaseName !== snakeCaseName) {
				this.components.set(kebabCaseName, {
					...componentData,
					name: kebabCaseName // Use kebab-case name for this entry
				});
			}
		} catch (error) {
			console.error(`Error parsing component ${filePath}:`, error);
		}
	}

	getComponents(): CottonComponent[] {
		// Return unique components (by file path) to avoid duplicates in autocomplete
		const seen = new Set<string>();
		const components: CottonComponent[] = [];
		
		for (const component of this.components.values()) {
			if (!seen.has(component.filePath)) {
				seen.add(component.filePath);
				components.push(component);
			}
		}
		
		return components;
	}

	getComponent(name: string): CottonComponent | undefined {
		// Try exact match first
		let component = this.components.get(name);
		if (component) {
			return component;
		}
		
		// Normalize the name: convert all underscores to hyphens and try
		const kebabName = name.replace(/_/g, '-');
		component = this.components.get(kebabName);
		if (component) {
			return component;
		}
		
		// Try converting all hyphens to underscores
		const snakeName = name.replace(/-/g, '_');
		component = this.components.get(snakeName);
		if (component) {
			return component;
		}
		
		// Try mixed: the user might use data_view but file is data-view or vice versa
		// Split by dots (folder separator) and try all combinations
		for (const [key, comp] of this.components) {
			const normalizedKey = key.replace(/[-_]/g, '');
			const normalizedName = name.replace(/[-_]/g, '');
			if (normalizedKey === normalizedName) {
				return comp;
			}
		}
		
		return undefined;
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
				const namingStyle = config.get<string>('componentNamingStyle', 'snake_case');
				
				// Add completions for discovered components
				components.forEach(component => {
					// Format component name based on naming style preference
					const displayName = namingStyle === 'kebab-case' 
						? component.name.replace(/_/g, '-')
						: component.name; // snake_case is the default/original
					
					const item = new vscode.CompletionItem(`c-${displayName}`, vscode.CompletionItemKind.Class);
					
					// Build snippet with component attributes based on variables
					let snippet = `c-${displayName}`;
					
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
						snippet += `>\$${nextTabStop}</c-${displayName}>`;
					} else {
						// No slots - use self-closing tag
						snippet += ` />`;
					}
					
					item.insertText = new vscode.SnippetString(snippet);
					
					// Add documentation
					let documentation = `**Cotton Component: ${displayName}**\n\n`;
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

	// Register attribute completion provider for Cotton components
	const cottonAttributeCompletionProvider = vscode.languages.registerCompletionItemProvider(
		{ scheme: 'file', pattern: '**/*.{html,htm,cotton,cotton.html}' },
		{
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
				const config = vscode.workspace.getConfiguration('djangoCotton');
				if (!config.get<boolean>('enableAutocompletion', true)) {
					return [];
				}

				const lineText = document.lineAt(position).text;
				const beforeCursor = lineText.substring(0, position.character);
				
				// Check if we're inside a Cotton component tag
				const cottonTagMatch = beforeCursor.match(/<c-([a-zA-Z][a-zA-Z0-9_.-]*)[^>]*$/);
				if (!cottonTagMatch) {
					return [];
				}

				const componentName = cottonTagMatch[1];
				const component = componentProvider.getComponent(componentName);
				
				if (!component || component.variables.length === 0) {
					return [];
				}

				// Extract already used attributes (both = and : syntax)
				const tagContent = cottonTagMatch[0];
				const usedAttributes = new Set<string>();
				const attributeMatches = tagContent.matchAll(/(\w+)[=:]/g);
				for (const match of attributeMatches) {
					usedAttributes.add(match[1]);
				}

				// Check if we're typing after a colon (Django Cotton feature)
				const isColonContext = beforeCursor.endsWith(':');

				const completionItems: vscode.CompletionItem[] = [];
				
				// Add completions for component variables that haven't been used yet
				component.variables.forEach(variable => {
					if (!usedAttributes.has(variable)) {
						const item = new vscode.CompletionItem(variable, vscode.CompletionItemKind.Property);
						
						if (isColonContext) {
							// For colon syntax, just insert the variable name
							item.insertText = new vscode.SnippetString(`${variable}="$1"`);
						} else {
							// For regular syntax, insert variable="value"
							item.insertText = new vscode.SnippetString(`${variable}="$1"`);
						}
						
						item.documentation = new vscode.MarkdownString(`**Component Variable**\n\nAttribute for component: \`c-${component.name}\`\n\nSupports both \`${variable}="value"\` and \`:${variable}="value"\` syntax.`);
						item.detail = `Cotton component attribute`;
						completionItems.push(item);
					}
				});

				return completionItems;
			}
		},
		' ', '=', ':' // trigger on space, equals, and colon
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

	// Register definition provider for Go to Definition (Cmd+Click)
	const cottonDefinitionProvider = vscode.languages.registerDefinitionProvider(
		{ scheme: 'file', pattern: '**/*.{html,htm,cotton,cotton.html}' },
		{
			provideDefinition(document, position, token) {
				// Match Cotton component tags: <c-component-name or </c-component-name
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
				
				if (component && component.filePath) {
					const uri = vscode.Uri.file(component.filePath);
					// Return location at the start of the file
					return new vscode.Location(uri, new vscode.Position(0, 0));
				}
				
				return null;
			}
		}
	);

	// Create diagnostic collection for unknown components
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('cottonComponents');

	// Function to validate Cotton components in a document
	function validateCottonComponents(document: vscode.TextDocument) {
		const diagnostics: vscode.Diagnostic[] = [];
		const text = document.getText();
		
		// Find all Cotton component references with their full tag content
		// Updated to match Django Cotton naming: kebab-case with dots for folders
		const componentRegex = /<c-([a-zA-Z][a-zA-Z0-9_.-]*)[^>]*>/g;
		let match;
		
		while ((match = componentRegex.exec(text)) !== null) {
			const componentName = match[1];
			const fullTag = match[0];
			const component = componentProvider.getComponent(componentName);
			
			if (!component) {
				// Unknown component - red error
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
			} else {
				// Known component - check for unknown attributes (both = and : syntax)
				const attributeMatches = Array.from(fullTag.matchAll(/(\w+)[=:]/g));
				const validAttributes = new Set(component.variables);
				
				// Check each attribute to see if it's valid
				for (const attributeMatch of attributeMatches) {
					const attributeName = attributeMatch[1];
					if (!validAttributes.has(attributeName)) {
						// Find the position of this specific attribute
						const attributeIndex = match.index + fullTag.indexOf(attributeName, fullTag.indexOf('=') > -1 ? 0 : fullTag.indexOf(attributeName));
						const startPos = document.positionAt(attributeIndex);
						const endPos = document.positionAt(attributeIndex + attributeName.length);
						const range = new vscode.Range(startPos, endPos);
						
						const diagnostic = new vscode.Diagnostic(
							range,
							`Unknown attribute '${attributeName}' for component '${componentName}'. Valid attributes: ${component.variables.join(', ')}`,
							vscode.DiagnosticSeverity.Warning
						);
						diagnostic.code = 'cotton-unknown-attribute';
						diagnostic.source = 'Django Cotton';
						diagnostics.push(diagnostic);
					}
				}
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

	// Connect automatic refresh to diagnostics
	componentProvider.onComponentsChanged = () => {
		// Re-validate all open documents after components refresh
		vscode.workspace.textDocuments.forEach(document => {
			if (document.languageId === 'html' || document.languageId === 'cotton' || 
				document.fileName.endsWith('.html') || document.fileName.endsWith('.cotton.html')) {
				validateCottonComponents(document);
			}
		});
	};

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

	// Command to create docstring
	const createDocstringCommand = vscode.commands.registerCommand('django-cotton-highlighting.createDocstring', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found');
			return;
		}

		const document = editor.document;
		if (!document.fileName.endsWith('.html') && !document.fileName.endsWith('.cotton.html') && !document.fileName.endsWith('.cotton')) {
			vscode.window.showErrorMessage('This command is only available for Cotton template files');
			return;
		}

		// Parse the current file to extract variables
		const content = document.getText();
		const variableMatches = content.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|[^}]*)?\}\}/g);
		const variables = Array.from(variableMatches).map(match => match[1]);
		const uniqueVariables = [...new Set(variables)];

		// Check if component has slots and what type
		const hasDefaultSlot = content.includes('{{ slot }}');
		const namedSlotMatches = content.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
		const namedSlots: string[] = [];
		
		// Find named slots by looking for variables that are used in {% if %} blocks (common pattern for optional slots)
		const conditionalSlotMatches = content.matchAll(/\{\%\s*if\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\%\}[\s\S]*?\{\{\s*\1\s*\}\}/g);
		const conditionalSlots = Array.from(conditionalSlotMatches).map(match => match[1]);
		
		// Also look for explicit c-slot references with name attributes
		const explicitSlotMatches = content.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
		for (const match of explicitSlotMatches) {
			const variable = match[1];
			// If it's used in a conditional pattern, it's likely a named slot
			if (conditionalSlots.includes(variable) && variable !== 'slot') {
				namedSlots.push(variable);
			}
		}
		
		// Remove duplicates and standard variables
		const uniqueNamedSlots = [...new Set(namedSlots)].filter(slot => 
			!uniqueVariables.includes(slot) && slot !== 'slot' && slot !== 'attrs'
		);

		// Get the filename for the docstring
		const fileName = path.basename(document.fileName, path.extname(document.fileName));

		// Generate the docstring template using VS Code snippet syntax
		let snippetString = '{% comment %}\n';
		snippetString += `${fileName}\n\n`;
		
		let tabIndex = 1;
		snippetString += `\$${tabIndex++}\n\n`; // Description placeholder
		
		if (uniqueVariables.length > 0) {
			snippetString += 'Parameters:\n';
			uniqueVariables.forEach(variable => {
				snippetString += `- ${variable} (\$${tabIndex++}): \$${tabIndex++}\n`;
			});
			snippetString += '\n';
		}

		if (hasDefaultSlot || uniqueNamedSlots.length > 0) {
			snippetString += 'Slots:\n';
			
			if (hasDefaultSlot) {
				snippetString += `- default: \$${tabIndex++}\n`;
			}
			
			uniqueNamedSlots.forEach(slotName => {
				snippetString += `- ${slotName}: \$${tabIndex++}\n`;
			});
		}

		snippetString += '{% endcomment %}\n\n';

		// Insert the docstring as a snippet at the beginning of the file
		const firstLine = document.lineAt(0);
		const snippet = new vscode.SnippetString(snippetString);
		
		await editor.insertSnippet(snippet, firstLine.range.start);

		vscode.window.showInformationMessage('Docstring template created! Use Tab to navigate between placeholders.');
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
		createDocstringCommand,
		cottonCompletionProvider,
		cottonAttributeCompletionProvider,
		cottonHoverProvider,
		cottonDefinitionProvider,
		componentProvider,
		configWatcher,
		diagnosticCollection,
		activeDocumentWatcher,
		openDocumentWatcher
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
