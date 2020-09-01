import { Logger } from "./package-manager/src/logger";
import * as vscode from "vscode";
import { default as axios } from "axios";
import { isPythonInstalled } from "./extension";

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
  return axios
    .get(`${gistUrl}/raw`, { responseType: "json" })
    .then((data) => {
      pipPackagesCached = data.data;
      return pipPackagesCached;
    })
    .catch((error) => {
      Logger.log(error);
      return [] as ToInstallPipPackage[];
    });
}

function wrongVersion(installed: PipPackage, requested: ToInstallPipPackage) {
  if (!requested.version) {
    return false;
  }
  if (requested.version.startsWith(">=")) {
    // it's the wrong version, when the installed version is lower than the requested.
    return requested.version!.slice(2) > installed.version;
  }
  if (requested.version.startsWith("<=")) {
    // it's the wrong version, when the installed version is higher than the requested.
    return requested.version!.slice(2) < installed.version;
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

export function installPipPackagesFromGist(): Thenable<boolean> {
  if (!isPythonInstalled()) {
    return new Promise((resolve) => resolve(false));
  }
  const config = vscode.workspace.getConfiguration();
  const gistUrl = config.get("python2go.gistPipUrl");
  if (!gistUrl || gistUrl === "") {
    return new Promise((resolve) => resolve(false));
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
      (packages): Thenable<boolean> => {
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
              ? `${pkg.package}==${pkg.version
                  .replace("<", "")
                  .replace(">=", "")}`
              : pkg.package
          );
          return vscode.commands
            .executeCommand(
              "python2go.pip",
              `install ${target} ${toInstallPkgs.join(" ")}`
            )
            .then(() => new Promise((resolve) => resolve(true)));
        }
        return new Promise((resolve) => resolve(false));
      }
    )
    .then(
      (result) => {
        return result;
      },
      (err) => {
        console.log(err);
        return false;
      }
    );
}
