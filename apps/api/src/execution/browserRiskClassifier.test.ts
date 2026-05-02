import { describe, expect, it } from "vitest";
import { classifyBrowserAction, hostMatchesTrustedDomains } from "./browserRiskClassifier";

describe("browserRiskClassifier", () => {
  it("requires approval for destructive button clicks", () => {
    const result = classifyBrowserAction(
      "browser_click",
      "button",
      {
        html: "<html><body><button>Delete Account</button></body></html>",
        url: "https://example.com/settings",
      },
    );

    expect(result).toMatchObject({
      level: "approve",
      matchedRule: "destructive_button_label",
    });
    expect(result.reason).toContain("Delete Account");
  });

  it("requires approval for submit buttons", () => {
    const result = classifyBrowserAction(
      "browser_click",
      "button[type=submit]",
      {
        html: '<form action="/send"><button type="submit">Send</button></form>',
        url: "https://example.com/contact",
      },
    );

    expect(result).toMatchObject({
      level: "approve",
      matchedRule: "submit_button",
      reason: "Click appears to submit a form",
    });
  });

  it("requires approval for payment fields and payment navigation", () => {
    expect(
      classifyBrowserAction("browser_type", "#card", {
        html: '<label>Credit card</label><input id="card" autocomplete="cc-number">',
        url: "https://shop.test/cart",
      }),
    ).toMatchObject({ level: "approve", matchedRule: "payment_field" });

    expect(
      classifyBrowserAction("browser_navigate", "https://shop.test/checkout", {
        html: "",
        url: "about:blank",
      }),
    ).toMatchObject({ level: "approve", matchedRule: "payment_url" });
  });

  it("requires approval for auth-sensitive navigation", () => {
    expect(
      classifyBrowserAction("browser_navigate", "https://example.com/oauth/start", {
        html: "",
        url: "about:blank",
      }),
    ).toMatchObject({ level: "approve", matchedRule: "auth_sensitive_url" });
  });

  it("allows safe browser reads", () => {
    expect(
      classifyBrowserAction("browser_extract_text", "body", {
        html: "<main>Hello</main>",
        url: "https://example.com/",
      }),
    ).toMatchObject({ level: "safe" });
  });

  it("matches trusted domains including subdomains", () => {
    expect(hostMatchesTrustedDomains("https://checkout.example.com/cart", ["example.com"])).toBe(true);
    expect(hostMatchesTrustedDomains("https://evil-example.com/cart", ["example.com"])).toBe(false);
  });
});
