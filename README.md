# Django Cotton VS Code Extension

A VS Code extension that provides comprehensive support for [Django Cotton](https://django-cotton.com) - a component-based template system for Django.

## Features

- **Syntax Highlighting**: Custom syntax highlighting for Cotton templates (.cotton.html files)
- **Component Autocomplete**: Intelligent autocomplete for Cotton components based on your template files
- **Documentation on Hover**: Shows component documentation from `{% comment %}` blocks when hovering over components
- **Template Variable Highlighting**: Highlights Django template variables `{{ }}` as function parameters
- **Configurable Template Path**: Set your Cotton templates directory for component discovery

## Getting Started

### 1. Install the Extension

Install from the VS Code Marketplace or search for "Django Cotton" in VS Code extensions.

### 2. Configure Your Cotton Templates Path

1. Open VS Code Settings (`Cmd/Ctrl + ,`)
2. Search for "django cotton"
3. Set **"Django Cotton: Templates Path"** to your Cotton templates directory (e.g., `./templates/cotton`)

### 3. Refresh Components

1. Open Command Palette (`Cmd/Ctrl + Shift + P`)
2. Run **"Django Cotton: Refresh Components"**

## Usage

### Component Autocomplete

1. In any `.cotton.html` file, start typing `<c-`
2. You'll see autocomplete suggestions for all your Cotton components
3. Select a component to auto-complete with proper syntax

### Documentation on Hover

- Hover over any Cotton component tag (e.g., `<c-card>`) 
- View documentation extracted from `{% comment %}` blocks in your component files

### Template Variables

- Template variables `{{ variable_name }}` are highlighted as function parameters
- Django template tags `{% tag %}` have special highlighting

## Cotton Component Structure

Your Cotton components should follow this structure:

\`\`\`html
{% comment %}
Component Name

Description of what this component does.

Parameters:
- param1: Description (required/optional)
- param2: Description with type info

Slots:
- default: Main content area
- slot_name: Named slot description
{% endcomment %}

<div class="component">
  {{ param1 }}
  <c-slot name="slot_name" />
</div>
\`\`\`

## Extension Settings

This extension contributes the following settings:

- \`djangoCotton.templatesPath\`: Path to your Cotton templates directory (relative to workspace root)
- \`djangoCotton.enableAutocompletion\`: Enable/disable autocompletion for Cotton components
- \`djangoCotton.highlightVariables\`: Enable/disable template variable highlighting

## Requirements

- VS Code 1.105.0 or higher
- Django Cotton templates in your project

## Known Issues

- Component discovery requires manual refresh after adding new components
- Syntax highlighting may conflict with other HTML extensions in some cases

## Release Notes

### 0.0.1

- Initial release
- Basic syntax highlighting for Cotton templates
- Component autocomplete based on file discovery
- Documentation parsing from comment blocks
- Template variable highlighting
- Configurable templates path

---

**Enjoy building with Django Cotton!**
