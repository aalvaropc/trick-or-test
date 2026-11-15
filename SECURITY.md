# Security policy

## Supported versions

Only the latest published version of `trick-or-test` receives security fixes.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Please do not open a public issue, discussion or pull request.

Include what you found, how to reproduce it and the impact you expect. You will get an acknowledgement within 7 days and a status update at least every 14 days until the report is resolved.

## Scope

Trick or Test runs your test suite against modified copies of your code and installs hooks into an AI coding agent. Reports about the following are especially welcome:

- a mutant or hook that writes outside the sandbox copy or the project directory;
- a way for an agent to modify a sealed test through the file-write tools without the hook blocking it;
- untrusted report, mutant or configuration files that lead to code execution in the viewer or the CLI.
