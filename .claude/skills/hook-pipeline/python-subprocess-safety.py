#!/usr/bin/env python3
import ast
import sys

class SubprocessSafetyVisitor(ast.NodeVisitor):
    def __init__(self):
        self.unsafe_calls = []
        self.allowed_stderr_values = {'Attribute': ['PIPE', 'DEVNULL', 'STDOUT'],
                                      'Name': ['subprocess.PIPE', 'subprocess.DEVNULL', 'subprocess.STDOUT']}

    def is_safe_stderr(self, node):
        if isinstance(node, ast.Attribute):
            return node.attr in self.allowed_stderr_values['Attribute']
        if isinstance(node, ast.Name):
            return node.id in self.allowed_stderr_values['Name']
        return False

    def visit_Call(self, node):
        if isinstance(node.func, ast.Attribute):
            func_name = node.func.attr
            if func_name in ['run', 'Popen', 'check_output']:
                # Check if from subprocess module
                module_name = None
                if isinstance(node.func.value, ast.Name):
                    module_name = node.func.value.id

                if module_name == 'subprocess':
                    # Strategies for safe subprocess calls
                    stderr_found = False
                    capture_output_found = False

                    for kw in node.keywords:
                        if kw.arg == 'stderr' and self.is_safe_stderr(kw.value):
                            stderr_found = True
                        if kw.arg == 'capture_output' and isinstance(kw.value, ast.NameConstant) and kw.value.value is True:
                            capture_output_found = True

                    if not (stderr_found or capture_output_found):
                        self.unsafe_calls.append(
                            f"Line {node.lineno}: Subprocess call '{func_name}' without stderr parameter or capture_output"
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