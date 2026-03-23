./execute.sh validate-json --file deliverables.json --schema schema.json
./execute.sh calculate-deliverable-confidence --deliverables ./artifacts/
./execute.sh run-instrumented --command "npm test" --output-dir ./test-results/