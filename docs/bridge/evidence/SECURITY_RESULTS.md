{
  "date": "2026-09-01T19:41:59.916Z",
  "result": {
    "command": "node --test --test-reporter=tap dist/tests/bridgeSecurity.test.js dist/tests/bridgeConfigPath.test.js dist/tests/bridgeApprovalSchema.test.js dist/tests/bridgeProcess.test.js dist/tests/bridgeE2e.test.js dist/tests/bridgeCommand.test.js",
    "cwd": "C:\\Users\\eiden\\Desktop\\dev\\projet-os",
    "exitCode": 0,
    "out": "TAP version 13\n# Subtest: approval: FAIL-CLOSED matrix\nok 1 - approval: FAIL-CLOSED matrix\n  ---\n  duration_ms: 0.8272\n  type: 'test'\n  ...\n# Subtest: approval: unapproved ws denies reads; writes disabled denies exec"
  },
  "notes": [
    "traversal/device/null/encoded blocked",
    "secret .env/key blocked",
    "shell metachars blocked",
    "concurrency bounded",
    "redaction verified",
    "out-of-workspace write impossible"
  ]
}
