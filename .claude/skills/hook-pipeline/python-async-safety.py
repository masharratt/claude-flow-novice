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

    def is_safe_async_context(self, node):
        """Determine if async call is in a safe context"""
        # Safe contexts:
        # 1. Direct await
        # 2. create_task/gather
        # 3. Tracked async operations
        safe_async_funcs = {'create_task', 'gather'}
        safe_modules = {'asyncio'}

        # Check for await
        is_awaited = self.get_parent(node, ast.Await) is not None

        # Check for safe async module functions
        is_safe_func = (
            isinstance(node.func, ast.Attribute) and
            node.func.attr in safe_async_funcs and
            (node.func.value.id if isinstance(node.func.value, ast.Name) else None) in safe_modules
        )

        # Detect assignment for later use
        parent = self.get_parent(node)
        is_task_creation = (
            isinstance(parent, ast.Assign)
        )

        if self.debug and not (is_awaited or is_safe_func or is_task_creation):
            print(f"Debugging - Unsafe Context: {ast.dump(node)}")
            print(f"Is Awaited: {is_awaited}, Is Safe Func: {is_safe_func}, Is Task Creation: {is_task_creation}")

        return is_awaited or is_safe_func or is_task_creation

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

        # Detect function name
        func_name = (
            node.func.attr if isinstance(node.func, ast.Attribute)
            else node.func.id if isinstance(node.func, ast.Name)
            else 'Unknown'
        )

        # Check if call is unsafe
        if not self.is_safe_async_context(node):
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