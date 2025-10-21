#!/bin/bash
# Minimal post-edit hook for validation

for file in "$@"; do
    echo "Validating: $file"
    case "$file" in
        *.sh)
            bash -n "$file" || { echo "Shell script syntax error in $file"; exit 1; }
            ;;
        *.md)
            # Basic markdown validation
            [[ -s "$file" ]] || { echo "Markdown file $file is empty"; exit 1; }
            ;;
        *)
            echo "No specific validation for $file"
            ;;
    esac
done

echo "Post-edit validation complete."
exit 0