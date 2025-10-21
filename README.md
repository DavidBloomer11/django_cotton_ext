# django-cotton-highlighting README

This is the README for your extension "django-cotton-highlighting". After writing up a brief description, we recommend including the following sections.

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

# Django Cotton VS Code Extension

A VS Code extension that provides comprehensive support for Django Cotton - a component-based template system for Django.

## Features

- **Syntax Highlighting**: Custom syntax highlighting for Cotton templates (.cotton.html files)
- **Component Autocomplete**: Intelligent autocomplete for Cotton components based on your template files
- **Documentation on Hover**: Shows component documentation from `{% comment %}` blocks when hovering over components
- **Template Variable Highlighting**: Highlights Django template variables `{{ }}` as function parameters
- **Configurable Template Path**: Set your Cotton templates directory for component discovery

## Getting Started

### 1. Install the Extension
This extension is currently in development. To test it:

1. Open this project in VS Code
2. Press `F5` or go to Run > Start Debugging
3. This will open a new Extension Development Host window

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

```html
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
```

## Extension Settings

This extension contributes the following settings:

- `djangoCotton.templatesPath`: Path to your Cotton templates directory (default: `./templates/cotton`)

## Testing

The project includes sample Cotton templates in `templates/cotton/`:
- `card.html` - Card component with title, content, and footer
- `button.html` - Button component with various types and sizes  
- `modal.html` - Modal dialog component

Use `test-cotton.cotton.html` to test all features.

## Development

### Building
```bash
npm run compile
```

### Testing
```bash
npm test
```

### Debugging
Press `F5` to run the extension in a new Extension Development Host window.

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

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
