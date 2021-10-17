import { Logger } from "./lib/logger";
import * as vscode from "vscode";
import { default as axios } from "axios";
import { isPythonInstalled } from "./extension";

interface Version {
  major: number;
  minor: number;
  patch: number;
}

interface PipPackage {
  package: string;
  version: string;
}

interface ToInstallPipPackage {
  package: string;
  version?: string;
}
let pipPackagesCached: ToInstallPipPackage[] = [];

export function clearCached() {
  pipPackagesCached.splice(0);
}

const VERSION_REGEX = /(?<major>\d+)\.(?<minor>\d+)\.?(?<patch>.+)?/i;

const LE = "<=";
const GE = ">=";

/**
 *
 * @param gistUrl url to the gist (not the raw), e.g https://gist.github.com/lebalz/8224837c3e4238288bbf2bda5af17fdf
 */
function pipPackagesFromGist(): Promise<ToInstallPipPackage[]> {
  const config = vscode.workspace.getConfiguration();
  const gistUrl = config.get("python2go.gistPipUrl");
  if (!gistUrl || gistUrl === "") {
    return new Promise((resolve) => resolve([]));
  }
  if (pipPackagesCached.length > 0) {
    return new Promise((resolve) => resolve(pipPackagesCached));
  }
  Logger.log(`Start downloading pip packages from ${gistUrl}`);
  return axios
    .get(`${gistUrl}/raw`, { responseType: "json" })
    .then((data) => {
      pipPackagesCached = data.data;
      Logger.log(
        `Gist content ${JSON.stringify(pipPackagesCached, undefined, 2)}`
      );
      return pipPackagesCached;
    })
    .catch((error) => {
      Logger.log(error);
      vscode.window.showErrorMessage(
        `Gist Content could not be downloaded from ${gistUrl}: ${error}`
      );
      return [] as ToInstallPipPackage[];
    });
}

function parseVersion(versionString: string): Version {
  if (!versionString) {
    return { major: Number.NaN, minor: Number.NaN, patch: Number.NaN };
  }
  const version = versionString.match(VERSION_REGEX);
  if (!version || !version.groups) {
    return { major: Number.NaN, minor: Number.NaN, patch: Number.NaN };
  }
  return {
    major: Number.parseInt(version.groups["major"], 10),
    minor: Number.parseInt(version.groups["minor"], 10),
    patch: Number.parseInt(version.groups["patch"], 10),
  };
}

function wrongVersion(installed: PipPackage, requested: ToInstallPipPackage) {
  if (!requested.version) {
    return false;
  }
  const currentVersion = parseVersion(installed.version);
  const requestedVersion = parseVersion(requested.version);
  if (
    requestedVersion.major === undefined ||
    currentVersion.major === undefined
  ) {
    return false;
  }
  if (requested.version.startsWith(GE)) {
    // it's the wrong version, when the installed version is lower than the requested.
    if (requestedVersion.major > currentVersion.major) {
      return true;
    }
    if (requestedVersion.minor > currentVersion.minor) {
      return true;
    }
    if (requestedVersion.patch > currentVersion.patch) {
      return true;
    }
    return false;
  }
  if (requested.version.startsWith(LE)) {
    // it's the wrong version, when the installed version is higher than the requested.
    if (requestedVersion.major < currentVersion.major) {
      return true;
    }
    if (requestedVersion.minor < currentVersion.minor) {
      return true;
    }
    if (requestedVersion.patch < currentVersion.patch) {
      return true;
    }
    return false;
  }
  return requested.version !== installed.version;
}

function uninstallWrongPipVersions() {
  return vscode.commands
    .executeCommand("python2go.pipPackages")
    .then((pkgs: any) => {
      return pkgs as PipPackage[];
    })
    .then((installed) => {
      return pipPackagesFromGist().then((toInstall) => {
        return {
          installed: installed,
          toInstall: toInstall,
        };
      });
    })
    .then((packages) => {
      const toUninstall = packages.toInstall.filter((pkg) => {
        return packages.installed.some(
          (installed) =>
            installed.package === pkg.package && wrongVersion(installed, pkg)
        );
      });
      return new Promise((resolve) => {
        if (toUninstall.length === 0) {
          return resolve(true);
        }
        return resolve(
          vscode.commands.executeCommand(
            "python2go.pip",
            `uninstall -y ${toUninstall.map((p) => p.package).join(" ")}`
          )
        );
      });
    })
    .then(() => {
      return true;
    });
}

interface PipGistState {
  reloadRequired: boolean;
  success: boolean;
  msg?: string;
}

export function installPipPackagesFromGist(): Thenable<PipGistState> {
  if (!isPythonInstalled()) {
    return new Promise((resolve) => resolve({reloadRequired: false, success: false, msg: 'No valid python interpreter set.'}));
  }
  const config = vscode.workspace.getConfiguration();
  const gistUrl = config.get("python2go.gistPipUrl");
  if (!gistUrl || gistUrl === "") {
    return new Promise((resolve) => resolve({reloadRequired: false, success: false, msg: 'No python2go.gistPipUrl specified'}));
  }
  return uninstallWrongPipVersions()
    .then(() => {
      return vscode.commands.executeCommand("python2go.pipPackages");
    })
    .then((pkgs: any) => {
      return pkgs as PipPackage[];
    })
    .then((installed) => {
      return pipPackagesFromGist().then((toInstall) => {
        return {
          installed: installed,
          toInstall: toInstall,
        };
      });
    })
    .then(
      (packages): Thenable<PipGistState> => {
        const toInstall = packages.toInstall.filter(
          (pkg) =>
            !packages.installed.some(
              (installed) => installed.package === pkg.package
            )
        );
        if (toInstall.length > 0) {
          const target = process.platform === "win32" ? "--user" : "";
          const toInstallPkgs = toInstall.map((pkg) =>
            pkg.version
              ? `${pkg.package}==${pkg.version.replace(LE, "").replace(GE, "")}`
              : pkg.package
          );
          return vscode.commands
            .executeCommand(
              "python2go.pip",
              `install ${target} ${toInstallPkgs.join(" ")}`
            )
            .then(() => new Promise((resolve) => resolve({reloadRequired: true, success: true})));
        }
        return new Promise((resolve) => resolve({reloadRequired: false, success: true}));
      }
    )
    .then(
      (result) => {
        return result;
      },
      (err) => {
        console.log(err);
        return {reloadRequired: false, success: false, msg: err};
      }
    );
}
