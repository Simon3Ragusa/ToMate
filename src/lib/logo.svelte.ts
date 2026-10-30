// Logo style chosen in Settings: stored per user (localStorage, like the
// theme), shown live in the UI and pushed to the window's taskbar icon.

import { Image } from "@tauri-apps/api/image";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cleanStyle, logoPixels, DEFAULT_LOGO, type LogoStyle } from "./logo";

const KEY = "tomate.logo";

class LogoStore {
  style = $state<LogoStyle>(read());
  private iconTimer: ReturnType<typeof setTimeout> | undefined;

  /** Main window only: apply the saved style to the taskbar icon and follow other windows' changes. */
  init() {
    this.pushIcon();
    addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      this.style = read();
      this.pushIcon();
    });
  }

  set(patch: Partial<LogoStyle>) {
    this.style = cleanStyle({ ...this.style, ...patch });
    try {
      localStorage.setItem(KEY, JSON.stringify(this.style));
    } catch {
      /* kept for this session */
    }
    this.pushIcon();
  }

  reset() {
    this.set(DEFAULT_LOGO);
  }

  /** The taskbar icon follows the style (debounced: colour pickers fire on every move). */
  private pushIcon() {
    clearTimeout(this.iconTimer);
    this.iconTimer = setTimeout(async () => {
      try {
        const size = 64;
        const rgba = await logoPixels(this.style, size);
        await getCurrentWindow().setIcon(await Image.new(rgba, size, size));
      } catch (e) {
        console.warn("Couldn't update the window icon", e);
      }
    }, 250);
  }
}

function read(): LogoStyle {
  try {
    return cleanStyle(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_LOGO;
  }
}

export const logo = new LogoStore();
