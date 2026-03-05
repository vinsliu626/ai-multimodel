import { spawn } from "node:child_process";

function run(cmd, args) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });
  return child;
}

const detector = run("npm", ["run", "detector:local"]);
const app = run("npm", ["run", "dev"]);

const close = () => {
  detector.kill("SIGTERM");
  app.kill("SIGTERM");
};

process.on("SIGINT", close);
process.on("SIGTERM", close);
