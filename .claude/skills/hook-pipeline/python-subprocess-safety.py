#!/usr/bin/env python3
import ast
import sys

class SubprocessSafetyVisitor(ast.NodeVisitor):
    def __init__(self):
        self.unsafe_calls = []

    def visit_Call(self, node):
        if isinstance(node.func, ast.Attribute):
            func_name = node.func.attr
            if func_name in ['run', 'Popen', 'check_output']:
                # Check if from subprocess module
                module_name = None
                if isinstance(node.func.value, ast.Name):
                    module_name = node.func.value.id

                if module_name == 'subprocess':
                    # Check if stderr parameter is missing or not set
                    stderr_found = False
                    for kw in node.keywords:
                        if kw.arg == 'stderr':
                            stderr_found = True
                            break

                    if not stderr_found:
                        self.unsafe_calls.append(
                            f"Line {node.lineno}: Subprocess call '{func_name}' without stderr parameter"
                        )

        self.generic_visit(node)

def validate_subprocess_safety(file_path):
    try:
        with open(file_path, 'r') as f:
            tree = ast.parse(f.read(), filename=file_path)
    except SyntaxError as e:
        print(f"Syntax error in {file_path}: {e}")
        return 1
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return 1

    visitor = SubprocessSafetyVisitor()
    visitor.visit(tree)

    if visitor.unsafe_calls:
        print("Subprocess safety warnings:")
        for call in visitor.unsafe_calls:
            print(call)
        return 2

    return 0

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 python-subprocess-safety.py <python_file>")
        return 1

    file_path = sys.argv[1]
    result = validate_subprocess_safety(file_path)
    sys.exit(result)

if __name__ == '__main__':
    main()