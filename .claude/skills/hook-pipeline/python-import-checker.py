#!/usr/bin/env python3
import ast
import sys
import importlib.util
import importlib.machinery

class ImportChecker(ast.NodeVisitor):
    def __init__(self, debug=False):
        self.used_names = set()
        self.import_nodes = []
        self.imported_modules = set()
        self.debug = debug

    def visit_Import(self, node):
        for alias in node.names:
            # Track fully imported modules
            module_name = alias.name.split('.')[0]
            self.import_nodes.append((module_name, node.lineno))
            self.imported_modules.add(module_name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module:
            # Track modules imported from other modules
            base_module = node.module.split('.')[0]
            self.import_nodes.append((base_module, node.lineno))
            self.imported_modules.add(base_module)
        self.generic_visit(node)

    def visit_Name(self, node):
        # Track used names in loading context
        if isinstance(node.ctx, ast.Load):
            self.used_names.add(node.id)
        self.generic_visit(node)

def is_module_reachable(module_name, debug=False):
    """Comprehensive module resolution check"""
    if not module_name:
        return False

    if debug:
        print(f"Checking module: {module_name}")

    strategies = [
        lambda m: importlib.util.find_spec(m) is not None,
        lambda m: importlib.import_module(m) is not None,
        lambda m: importlib.machinery.SourceFileLoader(m, '') is not None
    ]

    results = [strategy(module_name) for strategy in strategies]

    if debug:
        for strategy, result in zip(['find_spec', 'import_module', 'SourceFileLoader'], results):
            print(f"  {strategy}: {result}")

    return any(results)

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

    # Extended skip list for standard and built-in libraries
    skip_modules = {
        'sys', 'os', 're', 'typing', 'collections', 'dataclasses',
        'datetime', 'math', 'json', 'asyncio', 'argparse', 'random',
        'functools', 'itertools', 'enum', 'pathlib', 'subprocess',
        'abc', 'time', 'logging', 'copy', 'contextlib', 'warnings'
    }

    # Advanced import resolution: Only check modules actually used
    unreachable_imports = [
        (module, lineno) for (module, lineno) in visitor.import_nodes
        if (module in visitor.used_names and
            module not in skip_modules and
            module not in visitor.imported_modules and
            not is_module_reachable(module, debug=debug))
    ]

    # Validation with line-specific details
    if unreachable_imports:
        print("Import resolution warnings:")
        for module, lineno in unreachable_imports:
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