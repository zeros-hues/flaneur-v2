import { readSecret, writeSecret } from "./lib/secret";

const form = document.querySelector<HTMLFormElement>("form");
const input = document.querySelector<HTMLInputElement>("#secret");
const status = document.querySelector<HTMLParagraphElement>("#status");

if (form && input && status) {
  void readSecret().then((secret) => {
    status.textContent = secret ? "A secret is saved." : "No secret saved yet.";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const secret = input.value.trim();
    if (!secret) return;
    void writeSecret(secret).then(() => {
      input.value = "";
      status.textContent = "Saved.";
    });
  });
}
