import * as vscode from "vscode";

export type Progress = vscode.Progress<{
  message?: string | undefined;
  increment?: number | undefined;
}>;

export function promptRootPassword(): Thenable<string | undefined> {
  return vscode.window.showInputBox({
    password: true,
    prompt: "Root Password (used to login to your computer)",
  });
}


