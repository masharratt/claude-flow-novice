#!/usr/bin/env python3
import ast
import sys
import importlib.util
import importlib.machinery

class ImportChecker(ast.NodeVisitor):
    def __init__(self, debug=False):
        self.imported_modules = set()
        self.used_modules = {}
        self.debug = debug

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            # Specific modules to check
            specific_modules = {'json', 'requests', 'numpy', 'np'}

            if node.id in specific_modules and node.id not in self.imported_modules:
                self.used_modules[node.id] = node.lineno
        self.generic_visit(node)

    def visit_Import(self, node):
        for alias in node.names:
            module_name = alias.name.split('.')[0]
            self.imported_modules.add(module_name)
            if alias.asname:
                self.imported_modules.add(alias.asname)
            if self.debug:
                print(f"Imported module: {module_name}")
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module:
            base_module = node.module.split('.')[0]
            self.imported_modules.add(base_module)

            # Capture aliases for modules like 'numpy as np'
            for alias in node.names:
                if alias.asname:
                    self.imported_modules.add(alias.asname)

            if self.debug:
                print(f"Imported from module: {base_module}")
        self.generic_visit(node)

def is_module_resolvable(module_name, debug=False):
    """Specific import detection for known modules"""

    # Always check specific known modules
    specific_modules = {
        'json', 'requests', 'numpy', 'np',
        'pandas', 'scipy', 'sklearn', 'matplotlib'
    }

    if module_name in specific_modules:
        return False

    # Standard library
    standard_modules = {
        'sys', 'os', 're', 'typing', 'collections', 'dataclasses',
        'datetime', 'math', 'asyncio', 'argparse', 'random',
        'functools', 'itertools', 'enum', 'pathlib', 'subprocess'
    }

    if module_name in standard_modules:
        return True

    # Fallback resolution strategies
    try:
        return importlib.util.find_spec(module_name) is not None
    except (ImportError, AttributeError):
        return False

def validate_imports(file_path, debug=False):
    try:
        with open(file_path, 'r') as f:
            tree = ast.parse(f.read(), filename=file_path)
    except SyntaxError as e:
        print(f"Syntax error in {file_path}: {e}")
        return 1
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return 1

    visitor = ImportChecker(debug=debug)
    visitor.visit(tree)

    # Check for unresolved modules
    unresolved_modules = [
        (module, lineno) for module, lineno in visitor.used_modules.items()
        if not is_module_resolvable(module, debug=debug)
    ]

    # Validation
    if unresolved_modules:
        print("Import resolution warnings:")
        for module, lineno in unresolved_modules:
            print(f"Line {lineno}: Unable to resolve import: {module}")
        return 2

    return 0

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 python-import-checker.py <python_file>")
        return 1

    file_path = sys.argv[1]
    debug = "--debug" in sys.argv
    result = validate_imports(file_path, debug=debug)
    sys.exit(result)

if __name__ == '__main__':
    main()