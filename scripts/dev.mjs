import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const processes = [
  ["backend", ["run", "dev", "--workspace", "backend"]],
  ["frontend", ["run", "dev", "--workspace", "frontend"]]
];

for (const [name, args] of processes) {
  const child = spawn(npmCommand, args, {
    stdio: "inherit",
    shell: false
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${name} dev server exited with code ${code}.`);
    }
  });
}
