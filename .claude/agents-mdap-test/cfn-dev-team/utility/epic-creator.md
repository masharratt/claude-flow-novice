{
  "epic": "kebab-case-name",
  "goal": "One sentence. What does success look like?",
  "mode": "mvp|standard|enterprise",
  "phases": [
    {
      "id": "p1",
      "name": "Short Phase Name",
      "sprints": [
        {
          "id": "p1.s1",
          "task": "Imperative verb phrase (e.g., 'Add login endpoint')",
          "file": "src/path/to/file.ts",
          "criteria": [
            "Function loginUser() exists",
            "Returns JWT on success",
            "Returns 401 on invalid credentials"
          ],
          "context": {
            "imports": ["jsonwebtoken", "bcrypt"],
            "depends_on": ["src/db/users.ts:findByEmail"],
            "test_command": "npm test -- auth.test.ts"
          }
        }
      ]
    }
  ]
}