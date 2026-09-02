{
  "date": "2026-09-01T19:41:59.916Z",
  "repo": "C:\\Users\\eiden\\Desktop\\dev\\projet-os",
  "git": "no .git (snapshot)",
  "typecheck": {
    "command": "npm run typecheck",
    "cwd": "C:\\Users\\eiden\\Desktop\\dev\\projet-os",
    "exitCode": 0,
    "out": "> cline-project-os@0.1.0 typecheck\n> tsc -p ./ --noEmit"
  },
  "test": {
    "command": "npm test",
    "cwd": "C:\\Users\\eiden\\Desktop\\dev\\projet-os",
    "exitCode": 0,
    "out": "> cline-project-os@0.1.0 test\n> npm run compile && node --test \"dist/tests/*.test.js\"\n> cline-project-os@0.1.0 compile\n> tsc -p ./\n✔ AddonManager install core is idempotent and stages files (14.9632ms)\n✔ AddonManager unknown addon errors; disable/enable toggle (14.1279ms)\n✔ AddonManager uninstall backs up files and removes entry (19.4097ms)\n✔ AddonManager.defaultSet returns core + stack (0.8798ms)"
  },
  "conclusion": "baseline: typecheck 0 · tests 341/341 PASS · ctest 1/1 PASS . Bridge module isolated."
}
