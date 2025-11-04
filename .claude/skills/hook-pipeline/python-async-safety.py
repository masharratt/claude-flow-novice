#!/usr/bin/env python3
import ast
import sys

class AsyncSafetyVisitor(ast.NodeVisitor):
    def __init__(self, debug=False):
        self.async_functions = {}
        self.unsafe_calls = []
        self.node_parents = {}
        self.debug = debug

    def visit(self, node):
        # Recursive parent tracking
        for child in ast.iter_child_nodes(node):
            self.node_parents[child] = node
        super().visit(node)

    def get_parent(self, node, node_type=None):
        """Recursively find parent of specified type"""
        current = self.node_parents.get(node)
        while current:
            if node_type is None or isinstance(current, node_type):
                return current
            current = self.node_parents.get(current)
        return None

    def is_awaited(self, node):
        """Check if node is directly inside an Await context"""
        # Parent chain traversal to find await
        parent = self.get_parent(node)
        while parent:
            if isinstance(parent, ast.Await):
                return True
            parent = self.get_parent(parent)
        return False

    def is_safe_call(self, node):
        """Detect safe async calls"""
        safe_async_funcs = {'create_task', 'gather'}
        safe_modules = {'asyncio'}

        return (
            isinstance(node.func, ast.Attribute) and
            node.func.attr in safe_async_funcs and
            (node.func.value.id if isinstance(node.func.value, ast.Name) else None) in safe_modules
        )

    def visit_AsyncFunctionDef(self, node):
        """Track async function contexts"""
        self.async_functions[node] = {
            'name': node.name,
            'context': node
        }
        self.generic_visit(node)

    def visit_Call(self, node):
        """Detect unsafe async calls"""
        # Skip if not in async function
        async_context = next(
            (func for func, details in self.async_functions.items()
             if node in ast.walk(details['context'])),
            None
        )
        if not async_context:
            return

        # Skip if it's a known safe call
        if self.is_safe_call(node):
            return

        # Detect function name
        func_name = (
            node.func.attr if isinstance(node.func, ast.Attribute)
            else node.func.id if isinstance(node.func, ast.Name)
            else 'Unknown'
        )

        # Detect if call is awaited
        if not self.is_awaited(node):
            if self.debug:
                print(f"Debugging - Unsafe Call: {ast.dump(node)}")
                print(f"Function: {func_name}, Awaited: False")

            self.unsafe_calls.append(
                f"Line {node.lineno}: Async function '{async_context.name}' calls '{func_name}' without await"
            )

        self.generic_visit(node)

def validate_async_safety(file_path, debug=False):
    try:
        with open(file_path, 'r') as f:
            content = f.read()
            tree = ast.parse(content, filename=file_path)
    except SyntaxError as e:
        print(f"Syntax error in {file_path}: {e}")
        return 1
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return 1

    visitor = AsyncSafetyVisitor(debug=debug)
    visitor.visit(tree)

    if visitor.unsafe_calls:
        print("Async safety warnings:")
        for call in visitor.unsafe_calls:
            print(call)
        return 2

    return 0

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 python-async-safety.py <python_file>")
        return 1

    file_path = sys.argv[1]
    debug = "--debug" in sys.argv
    result = validate_async_safety(file_path, debug=debug)
    sys.exit(result)

if __name__ == '__main__':
    main()