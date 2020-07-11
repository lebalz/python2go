import { OutputChannel, window } from "vscode";

const DEBUGGING_REGEXP = /\python2go\b/i;

export class Logger {
  static output: OutputChannel | undefined;
  static isDebugging = process.env && process.env.VSCODE_DEBUGGING_EXTENSION ? DEBUGGING_REGEXP.test(process.env.VSCODE_DEBUGGING_EXTENSION) : false;

  static configure(channelName: string) {
    this.output = window.createOutputChannel(channelName);
  }

  static log(message: any, ...optMessages: any[]) {
    if (this.isDebugging) {
      console.log(message, ...optMessages);
    }
    if (this.output) {
      this.output.appendLine(`${(new Date).toJSON()}: ${message} ${optMessages.join(' ')}`);
    }
  }

  static show() {
    this.output?.show();
  }

  static hide() {
    this.output?.hide();
  }

  static clear() {
    this.output?.clear();
  }
} 