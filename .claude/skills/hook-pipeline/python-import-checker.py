#!/usr/bin/env python3
import ast
import sys
import importlib.util

class ImportChecker(ast.NodeVisitor):
    def __init__(self):
        self.imports = set()
        self.unresolvable_imports = []

    def visit_Import(self, node):
        for alias in node.names:
            self.imports.add(alias.name.split('.')[0])
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module:
            base_module = node.module.split('.')[0]
            self.imports.add(base_module)
        self.generic_visit(node)

def validate_imports(file_path):
    try:
        with open(file_path, 'r') as f:
            tree = ast.parse(f.read(), filename=file_path)
    except SyntaxError as e:
        print(f"Syntax error in {file_path}: {e}")
        return 1
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return 1

    visitor = ImportChecker()
    visitor.visit(tree)

    # Skip built-ins and special modules
    skip_modules = {'sys', 'os', 're', 'typing', 'collections', 'dataclasses',
                    'datetime', 'math', 'json', 'asyncio', 'argparse'}

    unresolvable_imports = [
        module for module in visitor.imports
        if module not in skip_modules and
           importlib.util.find_spec(module) is None
    ]

    if unresolvable_imports:
        print("Import resolution warnings:")
        for module in unresolvable_imports:
            print(f"Unable to resolve import: {module}")
        return 2

    return 0

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 python-import-checker.py <python_file>")
        return 1

    file_path = sys.argv[1]
    result = validate_imports(file_path)
    sys.exit(result)

if __name__ == '__main__':
    main()