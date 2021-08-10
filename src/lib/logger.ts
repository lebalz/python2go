import { OutputChannel, window, } from "vscode";

export interface FileStats {
  ctime: Date;
  mtime: Date;
}

const ALIGN_LOGGED_NEWLINES = "\r\n                          ";
export class Logger {
  private static debugging_regex = /\package-manager\b/i;
  private static output: OutputChannel | undefined;

  private static isDebugging = false;

  static configure(extensionName: string, channelName: string) {
    this.output = window.createOutputChannel(channelName);
    this.debugging_regex = new RegExp(`\\${extensionName}\\b`, 'i');
    this.isDebugging = process.env && process.env.VSCODE_DEBUGGING_EXTENSION
      ? this.debugging_regex.test(process.env.VSCODE_DEBUGGING_EXTENSION)
      : false;
  }

  static log(message: any, ...optMessages: any[]) {
    if (this.isDebugging) {
      console.log(message, ...optMessages);
    }
    this.print(`${message} ${optMessages.join(' ')}`);
  }

  static warn(message: any, ...optMessages: any[]) {
    if (this.isDebugging) {
      console.warn(message, ...optMessages);
    }
    this.print(`[WARNING] ${message} ${optMessages.join(' ')}`);
  }

  static error(message: any, ...optMessages: any[]) {
    if (this.isDebugging) {
      console.error(message, ...optMessages);
    }
    this.print(`[ERROR] ${message} ${optMessages.join(' ')}`);
  }

  /**
   * the current timestamp is prepended and newlines within the text are aligned with the first text.
   * e.g.
   *    "Hello         -->          "2020-07-22T09:43:16.700Z: Hello
   *     World"                                                World"
   */
  static print(text: string) {
    this.output?.appendLine(`${(new Date).toJSON()}: ${text.trim().replace(/\r?\n/g, ALIGN_LOGGED_NEWLINES)}`);
  }

  static show() {
    this.output?.show(true);
  }

  static hide() {
    this.output?.hide();
  }

  static clear() {
    this.output?.clear();
  }
}
