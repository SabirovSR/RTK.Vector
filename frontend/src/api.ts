import type { components } from "./generated-api";
export type LoginInput = components["schemas"]["Login"];
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(form ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    const detail = value.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? "Проверьте поля формы: " +
            detail
              .map(
                (x: { loc: string[]; msg: string }) =>
                  x.loc.slice(1).join(".") + " — " + x.msg,
              )
              .join("; ")
          : "Не удалось выполнить запрос",
    );
  }
  return response.json();
}
