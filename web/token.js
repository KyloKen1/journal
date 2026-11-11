// This device's GitHub access token: kept in this browser only, sent only to api.github.com.
import { TOKEN_KEY } from "./config.js";
import { el } from "./dom.js";

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

// Private browsing or blocked site data can make localStorage throw.
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken() {
  try {
    return storage()?.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

// False (and nothing stored) when the text is blank or this browser can't store it.
export function setToken(text) {
  const token = String(text ?? "").trim();
  if (!token) return false;
  try {
    storage().setItem(TOKEN_KEY, token);
    return getToken() === token;
  } catch {
    return false;
  }
}

export function forgetToken() {
  try {
    storage()?.removeItem(TOKEN_KEY);
  } catch {
    // nothing stored, nothing to forget
  }
}

export function renderSetup(root, { message, onSaved }) {
  const input = el("input", {
    type: "password", class: "token-input", autocomplete: "off", spellcheck: false,
    placeholder: "Paste the token here", "aria-label": "GitHub access token",
    onkeydown: (e) => { if (e.key === "Enter") save(); },
  });
  const problem = el("p", { class: "setup-problem", role: "alert", hidden: true });

  function save() {
    if (!input.value.trim()) return;
    if (!setToken(input.value)) {
      problem.textContent = "This browser would not store the token. Check that site data isn't blocked or in private mode.";
      problem.hidden = false;
      return;
    }
    onSaved();
  }

  root.replaceChildren(
    el("section", { class: "setup" },
      el("h2", {}, "Set up this device"),
      message && el("p", { class: "setup-message" }, message),
      el("p", {}, "Your list is kept in a private GitHub repo. This device needs an access token to read and save it. The token stays in this browser."),
      el("ol", { class: "setup-steps" },
        el("li", {},
          "On github.com open Settings → Developer settings → Personal access tokens → Fine-grained tokens → ",
          el("a", { href: NEW_TOKEN_URL, target: "_blank", rel: "noopener" }, "Generate new token"), "."),
        el("li", {}, "Repository access: Only select repositories → ", el("strong", {}, "journal-data"), "."),
        el("li", {}, "Permissions: Repository permissions → Contents → ", el("strong", {}, "Read and write"), "."),
        el("li", {}, "Generate the token, copy it, and paste it here."),
      ),
      el("div", { class: "setup-row" },
        input,
        el("button", { type: "button", class: "primary", onclick: save }, "Save on this device"),
      ),
      problem,
    ),
  );
}
