#!/usr/bin/env python3
import ast
import sys

class AsyncSafetyVisitor(ast.NodeVisitor):
    def __init__(self):
        self.async_functions = {}
        self.unsafe_calls = []

    def visit_AsyncFunctionDef(self, node):
        # Store async function context
        self.async_functions[node] = {
            'name': node.name,
            'calls': set()
        }
        self.generic_visit(node)

    def visit_Call(self, node):
        # Check if this call is inside an async function
        for func, context in list(self.async_functions.items()):
            if node in ast.walk(func):
                # Check if this call is directly inside an async function
                # and not wrapped in an await
                parent = next((p for p in ast.iter_child_nodes(func) if node in ast.walk(p)), None)

                # Detect if call is not inside an Await node
                if not any(isinstance(p, ast.Await) for p in ast.walk(parent)):
                    func_name = (
                        node.func.attr if isinstance(node.func, ast.Attribute)
                        else node.func.id if isinstance(node.func, ast.Name)
                        else 'Unknown'
                    )
                    self.unsafe_calls.append(
                        f"Line {node.lineno}: Async function '{context['name']}' calls '{func_name}' without await"
                    )

        self.generic_visit(node)

def validate_async_safety(file_path):
    try:
        with open(file_path, 'r') as f:
            tree = ast.parse(f.read(), filename=file_path)
    except SyntaxError as e:
        print(f"Syntax error in {file_path}: {e}")
        return 1
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return 1

    visitor = AsyncSafetyVisitor()
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
    result = validate_async_safety(file_path)
    sys.exit(result)

if __name__ == '__main__':
    main()