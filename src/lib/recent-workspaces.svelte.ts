const KEY = "tomate-recent-workspaces";
const LIMIT = 10;

class RecentWorkspaces {
  paths = $state<string[]>([]);

  init() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      this.paths = Array.isArray(saved) ? saved.filter((path): path is string => typeof path === "string" && path.trim() !== "") : [];
    } catch {
      this.paths = [];
    }
  }

  add(path: string) {
    this.paths = [path, ...this.paths.filter((saved) => saved !== path)].slice(0, LIMIT);
    this.save();
  }

  remove(path: string) {
    this.paths = this.paths.filter((saved) => saved !== path);
    this.save();
  }

  private save() {
    localStorage.setItem(KEY, JSON.stringify(this.paths));
  }
}

export const recentWorkspaces = new RecentWorkspaces();
